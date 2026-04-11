import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { extractGoogleDocId, canonicalGoogleDocUrl } from "@pangofold/shared";
import { Link } from "react-router";
import { MapPin, FileText, Sparkles, ArrowRight, FolderOpen } from "lucide-react";
import { supabase } from "../lib/supabase";

async function extractFnError(err: unknown): Promise<string> {
  const fallback =
    err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
      ? (err as { message: string }).message
      : "Unknown error";
  try {
    const ctx =
      err && typeof err === "object" && "context" in err ? (err as { context: unknown }).context : undefined;
    if (ctx instanceof Response) {
      const body = (await ctx.json()) as { error?: string; details?: string; message?: string };
      return body?.error || body?.details || body?.message || fallback;
    }
    if (ctx && typeof ctx === "object") {
      const o = ctx as { error?: string; details?: string; message?: string };
      return o.error || o.details || o.message || fallback;
    }
  } catch { /* ignore */ }
  return fallback;
}

export function Landing() {
  const { user, session, loading, signInWithGoogle, signOut } = useAuth();
  const [docUrl, setDocUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Trip already stored for this canonical doc URL (re-import overwrites parsed data from the doc). */
  const [existingTripForDoc, setExistingTripForDoc] = useState<{ id: string; title: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.id || !docUrl.trim()) {
      setExistingTripForDoc(null);
      return;
    }
    const canon = canonicalGoogleDocUrl(docUrl);
    if (!canon) {
      setExistingTripForDoc(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from("trips")
      .select("id, title")
      .eq("owner_id", user.id)
      .eq("source_doc_url", canon)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setExistingTripForDoc(data ? { id: data.id, title: data.title } : null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, docUrl]);

  const processDoc = useCallback(async (url: string) => {
    setDocUrl(url);
    setError(null);
    setParsing(true);
    setStatus("Connecting...");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Please sign in first.");
        return;
      }

      const providerToken = session.provider_token
        || sessionStorage.getItem("google_provider_token");

      if (!providerToken) {
        setError("Google access expired. Please sign out and sign in again.");
        return;
      }

      setStatus("Fetching your Google Doc...");
      const fetchRes = await supabase.functions.invoke("fetch-doc", {
        body: { docUrl: url, providerToken },
      });

      console.log("[Pangofold] fetch-doc result:", { data: fetchRes.data, error: fetchRes.error });

      if (fetchRes.error) {
        const detail = await extractFnError(fetchRes.error);
        if (detail.includes("401")) {
          sessionStorage.removeItem("google_provider_token");
          throw new Error("Google token expired. Please sign out and sign back in, then try again.");
        }
        throw new Error(detail);
      }

      setStatus("AI is reading your trip plan — this can take up to 60 seconds...");
      const parseRes = await supabase.functions.invoke("parse-trip", {
        body: { ...fetchRes.data, userId: session.user.id },
      });

      console.log("[Pangofold] parse-trip result:", { data: parseRes.data, error: parseRes.error });

      if (parseRes.error) {
        const detail = await extractFnError(parseRes.error);
        throw new Error(detail);
      }

      setStatus("Done! Redirecting...");
      navigate(`/trip/${parseRes.data.tripId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong parsing your doc.");
    } finally {
      setParsing(false);
      setStatus("");
    }
  }, [navigate]);

  useEffect(() => {
    if (user && session?.provider_token) {
      const pending = sessionStorage.getItem("pangofold_pending_doc");
      if (pending) {
        sessionStorage.removeItem("pangofold_pending_doc");
        processDoc(pending);
      }
    }
  }, [user, session, processDoc]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const docId = extractGoogleDocId(docUrl);
    if (!docId) {
      setError("That doesn't look like a Google Doc URL. Paste a link like docs.google.com/document/d/...");
      return;
    }

    await processDoc(docUrl);
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4 text-primary">
            <MapPin className="w-8 h-8" />
            <h1 className="text-3xl font-bold tracking-tight">Pangofold</h1>
          </div>
          <p className="text-text-muted text-lg">
            Turn your messy Google Doc trip plan into a beautiful, browsable trip guide.
          </p>
        </div>

        {!user && !loading && (
          <div className="bg-surface-card rounded-card border border-border p-8 shadow-sm">
            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 bg-text text-surface-card font-medium py-3 px-6 rounded-xl hover:bg-text/90 transition-colors cursor-pointer"
            >
              Sign in with Google
              <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-text-muted text-sm text-center mt-4">
              We need Google access to read your shared docs.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {user && (
          <div className="space-y-4">
            <div className="bg-surface-card rounded-card border border-border p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <p className="text-sm text-text-muted">
                  Signed in as <span className="font-medium text-text">{user.email}</span>
                </p>
                <div className="flex items-center gap-3">
                  <Link
                    to="/dashboard"
                    className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-dark transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    My Trips
                  </Link>
                  <button
                    onClick={signOut}
                    className="text-sm text-text-muted hover:text-text transition-colors cursor-pointer"
                  >
                    Sign out
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="doc-url" className="block text-sm font-medium mb-2">
                    Google Doc URL
                  </label>
                  <input
                    id="doc-url"
                    type="url"
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    placeholder="https://docs.google.com/document/d/..."
                    className="w-full px-4 py-3 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    required
                  />
                </div>

                {existingTripForDoc && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    <p className="font-medium">This doc is already imported as “{existingTripForDoc.title}”.</p>
                    <p className="mt-1 text-amber-900/90">
                      Importing again <strong>re-parses the doc</strong> and refreshes your itinerary from Google — it
                      does not duplicate the trip.
                    </p>
                    <Link
                      to={`/trip/${existingTripForDoc.id}`}
                      className="mt-2 inline-flex items-center gap-1 text-primary font-medium hover:underline"
                    >
                      Open existing trip <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={parsing || !docUrl}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-white font-medium py-3 px-6 rounded-xl hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  {parsing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {status || "Working..."}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Transform into Trip Guide
                    </>
                  )}
                </button>
              </form>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { icon: FileText, label: "Paste your doc" },
                { icon: Sparkles, label: "AI organizes it" },
                { icon: MapPin, label: "Browse on the go" },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="bg-surface-card rounded-xl border border-border p-4 shadow-sm"
                >
                  <Icon className="w-5 h-5 mx-auto mb-2 text-primary" />
                  <p className="text-xs text-text-muted">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
