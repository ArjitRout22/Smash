import "@testing-library/jest-dom/vitest";

// Deterministic defaults for tests that read env at import time.
process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test?schema=public";
process.env.SESSION_SECRET ||= "test-session-secret-0123456789abcdef0123456789abcdef";
process.env.DEFAULT_PHONE_REGION ||= "IN";
