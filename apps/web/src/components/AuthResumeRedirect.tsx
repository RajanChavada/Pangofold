import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { takeStashedOAuthPath } from "../lib/collab-resume";

/**
 * After Google OAuth, Supabase often lands on `/`. If the user started sign-in from a trip page,
 * send them back to that route.
 */
export function AuthResumeRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user) return;
    const resume = takeStashedOAuthPath();
    if (!resume) return;
    if (location.pathname + location.search === resume) return;
    navigate(resume, { replace: true });
  }, [user, loading, navigate, location.pathname, location.search]);

  return null;
}
