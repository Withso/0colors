// Supabase configuration — reads from env vars, falls back to defaults
export const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "qvayepdjxvkdeiczjzfj";
export const publicAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2YXllcGRqeHZrZGVpY3pqemZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTMxNTUsImV4cCI6MjA4NzU4OTE1NX0.3mAW-M5p2GxU0wHO6PYQS-ihlaJYdhWOzWL0WtiCFaY";
