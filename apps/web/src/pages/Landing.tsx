import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { extractGoogleDocId } from "@pangofold/shared";
import { MapPin, FileText, Sparkles, ArrowRight } from "lucide-react";
import { supabase } from "../lib/supabase";

export function Landing() {
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const [docUrl, setDocUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const docId = extractGoogleDocId(docUrl);
    if (!docId) {
      setError("That doesn't look like a Google Doc URL. Paste a link like docs.google.com/document/d/...");
      return;
    }

    setParsing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Please sign in first.");
        setParsing(false);
        return;
      }

      const fetchRes = await supabase.functions.invoke("fetch-doc", {
        body: { docUrl },
      });

      if (fetchRes.error) throw fetchRes.error;

      const parseRes = await supabase.functions.invoke("parse-trip", {
        body: fetchRes.data,
      });

      if (parseRes.error) throw parseRes.error;

      navigate(`/trip/${parseRes.data.tripId}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong parsing your doc.");
    } finally {
      setParsing(false);
    }
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
                <button
                  onClick={signOut}
                  className="text-sm text-text-muted hover:text-text transition-colors cursor-pointer"
                >
                  Sign out
                </button>
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
                      Parsing your trip...
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
