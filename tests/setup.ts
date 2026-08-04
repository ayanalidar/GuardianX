// Vitest global setup — sets env vars before any test imports @/lib/db or @/lib/auth.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://test.supabase.co";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-key";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-vitest-32chars";
