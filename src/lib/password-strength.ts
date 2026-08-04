// Password strength calculator — scores passwords 0-4 with feedback.

export interface PasswordStrengthResult {
  score: number; // 0-4
  label: string; // "Very Weak" | "Weak" | "Fair" | "Good" | "Strong"
  color: string; // tailwind color class
  feedback: string[];
}

const COMMON_PATTERNS = [
  /password/i, /123/, /abc/i, /qwerty/i, /admin/i, /letmein/i,
  /welcome/i, /monkey/i, /dragon/i, /master/i, /login/i,
  /^[\d]+$/, /^[a-z]+$/, /^[A-Z]+$/,
];

export function calculatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password || typeof password !== "string") {
    return { score: 0, label: "Very Weak", color: "red-500", feedback: ["Enter a password"] };
  }

  let score = 0;
  const feedback: string[] = [];

  // Length
  if (password.length < 8) {
    score -= 1;
    feedback.push("Use at least 8 characters");
  } else if (password.length >= 12) {
    score += 2;
  } else {
    score += 1;
    feedback.push("Use 12+ characters for better security");
  }

  // Character variety
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push("Add lowercase letters");

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push("Add uppercase letters");

  if (/\d/.test(password)) score += 1;
  else feedback.push("Add numbers");

  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  else feedback.push("Add special characters (!@#$)");

  // Common patterns penalty
  for (const pattern of COMMON_PATTERNS) {
    if (pattern.test(password)) {
      score -= 1;
      feedback.push("Avoid common patterns");
      break;
    }
  }

  // Clamp to 0-4
  score = Math.max(0, Math.min(4, score));

  const labels = ["Very Weak", "Weak", "Fair", "Good", "Strong"];
  const colors = ["red-500", "orange-500", "yellow-500", "lime-500", "emerald-500"];

  // Clear feedback for strong passwords
  if (score >= 4) feedback.length = 0;

  return {
    score,
    label: labels[score] || "Very Weak",
    color: colors[score] || "red-500",
    feedback,
  };
}
