// Multi-language secure-coding pattern registry used by the AI patcher.
//
// When the patcher is asked to fix a vulnerability in a file written in one of
// the supported languages, the prompt is augmented with language-specific
// secure-coding guidance (OWASP-recommended libraries + idioms). This nudges
// the model toward canonical defensive patterns instead of ad-hoc string
// filtering, which materially improves the long-tail bypass resistance of the
// generated patches and gives the confidence scorer something concrete to
// reward.

export type SupportedLanguage =
  | "javascript"
  | "typescript"
  | "python"
  | "go"
  | "java"
  | "php"
  | "ruby"
  | "csharp"
  | "cpp"
  | "rust";

export interface LanguagePattern {
  language: SupportedLanguage;
  displayName: string;
  fileExtensions: string[];
  // OWASP-recommended canonical patterns. Short, imperative, library-specific.
  patterns: {
    sqli: string;
    xss: string;
    pathTraversal: string;
    commandInjection: string;
    crypto: string;
    auth: string;
  };
  // Heuristics the confidence scorer uses to verify the patch actually uses
  // the recommended pattern (regex, case-insensitive).
  owaspIndicators: RegExp[];
}

export const LANGUAGE_PATTERNS: Record<SupportedLanguage, LanguagePattern> = {
  javascript: {
    language: "javascript",
    displayName: "JavaScript",
    fileExtensions: [".js", ".mjs", ".cjs", ".jsx"],
    patterns: {
      sqli:
        "Use parameterized queries / prepared statements. Never concatenate user input into SQL strings. For mysql2/pg use `connection.query(sql, [params])`. For Prisma use `prisma.$queryRaw` with tagged templates.",
      xss:
        "Encode user input before rendering. For HTML output use DOMPurify or `escape-html`. Set Content-Security-Policy via helmet.js. Avoid `dangerouslySetInnerHTML`. For React, JSX auto-escapes — never bypass it.",
      pathTraversal:
        "Resolve and validate: `const safe = path.resolve(baseDir, input); if (!safe.startsWith(baseDir + path.sep)) throw new Error('invalid path')`. Always use path.sep, not a hardcoded slash.",
      commandInjection:
        "Avoid `child_process.exec`. Use `child_process.execFile` / `spawn` with an args array — never a shell string. Validate inputs against an allowlist.",
      crypto:
        "Use `node:crypto` `randomBytes` / `randomInt` / `scrypt` (never `Math.random` for security). Hash passwords with bcrypt or argon2, never MD5/SHA1 for passwords.",
      auth:
        "Use constant-time comparison `crypto.timingSafeEqual` for tokens. Set httpOnly, secure, sameSite cookies. Enforce rate-limiting on auth endpoints.",
    },
    owaspIndicators: [
      /\b\?\s*[,)]/,                        // placeholder ?
      /query\([^)]*,\s*\[/,                 // query(sql, [params])
      /\bDOMPurify\b/i,
      /\bescape-html\b/i,
      /\bhelmet\b/i,
      /\bexecFile\b/,
      /\bspawn\(/,
      /\brandomBytes\b/,
      /\bscrypt\b/i,
      /\btimingSafeEqual\b/,
      /\bpath\.resolve\b/,
      /\bpath\.sep\b/,
      /httpOnly\s*[:=]/i,
      /sameSite\s*[:=]/i,
    ],
  },
  typescript: {
    language: "typescript",
    displayName: "TypeScript",
    fileExtensions: [".ts", ".tsx"],
    patterns: {
      sqli:
        "Use parameterized queries. For pg use `client.query(text, [params])`. For TypeORM use `createQueryBuilder` with `.setParameter()`. Never string-concat SQL.",
      xss:
        "JSX auto-escapes by default — do not use `dangerouslySetInnerHTML`. Sanitize HTML strings with DOMPurify before rendering. Apply helmet.js for CSP.",
      pathTraversal:
        "Resolve + validate with `path.resolve` + `path.sep` prefix check. Type input as `string` (not `any`).",
      commandInjection:
        "Use `execFile` / `spawn` with args array. Avoid shell string interpolation of user input.",
      crypto:
        "Use `crypto.randomBytes` / `scrypt`. Hash passwords with bcrypt. Verify with `timingSafeEqual`.",
      auth:
        "Use strict typed session objects. Validate input with zod at the boundary. Use httpOnly cookies.",
    },
    owaspIndicators: [
      /\b\?\s*[,)]/,
      /query\([^)]*,\s*\[/,
      /\bDOMPurify\b/i,
      /\bhelmet\b/i,
      /\bexecFile\b/,
      /\brandomBytes\b/,
      /\btimingSafeEqual\b/,
      /\bzod\b/i,
      /\bpath\.resolve\b/,
      /httpOnly\s*[:=]/i,
    ],
  },
  python: {
    language: "python",
    displayName: "Python",
    fileExtensions: [".py"],
    patterns: {
      sqli:
        "Use parameterized queries. For psycopg2: `cursor.execute('SELECT ... WHERE id=%s', (id,))`. For SQLAlchemy use bound parameters. NEVER f-string or `%`-format SQL.",
      xss:
        "Use `bleach.clean(user_input)` to sanitize HTML. For Jinja2, enable autoescape (default). For HTML responses, use `markupsafe.escape`. Never `|safe` user input.",
      pathTraversal:
        "Use `os.path.abspath` + `os.path.realpath` and verify the resolved path is within `base_dir`. Use `pathlib.Path.resolve()` and check `.is_relative_to(base)`.",
      commandInjection:
        "Use `subprocess.run(args_list, shell=False)`. NEVER `os.system` or `subprocess.call(shell=True)` with user input.",
      crypto:
        "Use the `secrets` module (not `random`) for tokens. Hash passwords with `bcrypt` or `argon2-cffi`. Never `hashlib.md5` for passwords.",
      auth:
        "Use `secrets.compare_digest` for constant-time comparison. Set Secure, HttpOnly, SameSite cookies via Flask/Django config.",
    },
    owaspIndicators: [
      /execute\([^)]*%s/,                    // psycopg2 placeholder
      /execute\([^,]+,\s*\(/,                // execute(sql, (params,))
      /\bbleach\.clean\b/i,
      /\bmarkupsafe\.escape\b/i,
      /\bautoescape\b/i,
      /\bsubprocess\.run\b/,
      /shell\s*=\s*False/,
      /\bsecrets\b/,
      /\bbcrypt\b/i,
      /\bargon2\b/i,
      /compare_digest\b/,
      /HttpOnly\s*[:=]/i,
      /pathlib\.Path/,
      /\bis_relative_to\b/,
    ],
  },
  go: {
    language: "go",
    displayName: "Go",
    fileExtensions: [".go"],
    patterns: {
      sqli:
        "Use `database/sql` with `?` placeholders: `db.QueryContext(ctx, 'SELECT ... WHERE id = ?', id)`. NEVER `fmt.Sprintf` into SQL.",
      xss:
        "Use `html/template` (auto-escaping) instead of `text/template`. For raw HTML, use `template.HTML` only after validation.",
      pathTraversal:
        "Use `filepath.Clean` + `filepath.Join(base, input)` and verify the result starts with `base + string(filepath.Separator)`.",
      commandInjection:
        "Use `exec.Command(name, args...)` with separate args — never a single shell string. Avoid `sh -c`.",
      crypto:
        "Use `crypto/rand` for tokens (`rand.Read`). Hash passwords with `golang.org/x/crypto/bcrypt`. Never `math/rand` for security.",
      auth:
        "Use `subtle.ConstantTimeCompare` for token comparison. Set HttpOnly, Secure, SameSite on cookies.",
    },
    owaspIndicators: [
      /QueryContext\([^,]+,\s*[^,]+,\s*/,
      /\b\?["`]/,                            // SQL placeholder ?
      /html\/template/,
      /text\/template/,
      /\bexec\.Command\b/,
      /crypto\/rand/,
      /\bbcrypt\b/i,
      /ConstantTimeCompare/,
      /HttpOnly\s*[:=]/i,
      /filepath\.Clean/,
      /filepath\.Join/,
    ],
  },
  java: {
    language: "java",
    displayName: "Java",
    fileExtensions: [".java"],
    patterns: {
      sqli:
        "Use `PreparedStatement` with `?` placeholders + `setString(idx, val)`. NEVER `Statement` + string concat. For JPA use `:named` parameters.",
      xss:
        "Use OWASP ESAPI `Encoder.encodeForHTML(input)`. For Spring, rely on Thymeleaf auto-escaping. Use `InputValidator` for allowlist validation.",
      pathTraversal:
        "Use `Paths.get(base).resolve(input).normalize()` and verify `.startsWith(basePath)`. Reject `..` segments.",
      commandInjection:
        "Use `ProcessBuilder(args)` with separate args. NEVER `Runtime.exec(String)` with user input.",
      crypto:
        "Use `SecureRandom` (not `Random`). Hash passwords with PBKDF2 / BCrypt (`SpringSecurity`). Never MD5 for passwords.",
      auth:
        "Use `MessageDigest.isEqual` for constant-time comparison. Configure security cookies with HttpOnly + Secure + SameSite.",
    },
    owaspIndicators: [
      /\bPreparedStatement\b/,
      /setString\(/,
      /setInt\(/,
      /\bESAPI\b/,
      /\bEncoder\.encodeForHTML\b/,
      /\bInputValidator\b/,
      /\bProcessBuilder\b/,
      /\bSecureRandom\b/,
      /\bPBKDF2\b/i,
      /\bBCrypt\b/i,
      /MessageDigest\.isEqual/,
      /Paths\.get/,
      /\.normalize\(\)/,
      /HttpOnly\s*[:=]/i,
    ],
  },
  php: {
    language: "php",
    displayName: "PHP",
    fileExtensions: [".php"],
    patterns: {
      sqli:
        "Use PDO with prepared statements: `$stmt = $pdo->prepare('SELECT ... WHERE id = ?'); $stmt->execute([$id]);`. NEVER `mysqli_query` with concat.",
      xss:
        "Use `htmlspecialchars($input, ENT_QUOTES, 'UTF-8')` for HTML output. Use `htmlentities` for full entity encoding. Set X-Content-Type-Options: nosniff.",
      pathTraversal:
        "Use `realpath($base . '/' . $input)` and verify it starts with `realpath($base)`. Reject `..` and null bytes.",
      commandInjection:
        "Use `escapeshellarg()` for each argument, or better: avoid `exec`/`system`/`shell_exec` with user input.",
      crypto:
        "Use `random_bytes()` / `random_int()` (not `rand()`). Hash passwords with `password_hash($pw, PASSWORD_BCRYPT)` + `password_verify`.",
      auth:
        "Use `hash_equals()` for constant-time comparison. Set cookies with `httponly` + `secure` + `samesite` flags.",
    },
    owaspIndicators: [
      /\bPDO\b/,
      /->prepare\(/,
      /->execute\(/,
      /\bhtmlspecialchars\b/,
      /ENT_QUOTES/,
      /\brealpath\b/,
      /\bescapeshellarg\b/,
      /\brandom_bytes\b/,
      /\brandom_int\b/,
      /\bpassword_hash\b/,
      /\bpassword_verify\b/,
      /\bhash_equals\b/,
      /httponly/i,
      /samesite/i,
    ],
  },
  ruby: {
    language: "ruby",
    displayName: "Ruby",
    fileExtensions: [".rb"],
    patterns: {
      sqli:
        "Use ActiveRecord parameter binding: `User.where('email = ?', email)`. For raw SQL use `sanitize_sql` or `?` placeholders. NEVER `'#{}'` interpolation in SQL.",
      xss:
        "Use `ERB::Util.html_escape(input)` (or `<%= h input %>`). For Rails, ERB auto-escapes — never use `raw` or `html_safe` on user input.",
      pathTraversal:
        "Use `File.expand_path(input, base)` and verify `.start_with?(base + '/')`. Reject `..`.",
      commandInjection:
        "Use `Open3.capture3(cmd, *args)` (array form). NEVER backticks or `system(str)` with user input.",
      crypto:
        "Use `SecureRandom.hex` / `SecureRandom.random_number` (not `rand`). Hash passwords with `bcrypt` gem or `Argon2`.",
      auth:
        "Use `Rack::Utils.secure_compare` for constant-time comparison. Set http_only + secure cookies.",
    },
    owaspIndicators: [
      /\.where\([^)]*\?/,
      /sanitize_sql/,
      /\bERB::Util\.html_escape\b/,
      /\bhtml_escape\b/,
      /File\.expand_path/,
      /Open3\./,
      /SecureRandom/,
      /\bbcrypt\b/i,
      /secure_compare/,
      /http_only/i,
    ],
  },
  csharp: {
    language: "csharp",
    displayName: "C#",
    fileExtensions: [".cs"],
    patterns: {
      sqli:
        "Use `SqlCommand` with `Parameters.AddWithValue('@name', value)`. NEVER string-concat SQL. For EF Core use LINQ or parameterized FromSqlRaw.",
      xss:
        "Use `System.Web.HttpUtility.HtmlEncode`. For Razor, enable auto-encoding. Use AntiXss library for output encoding.",
      pathTraversal:
        "Use `Path.GetFullPath(Path.Combine(base, input))` and verify `.StartsWith(base + Path.DirectorySeparatorChar)`.",
      commandInjection:
        "Use `Process.Start(processInfo)` with `ArgumentList` (separate args). Avoid `Process.Start(string)` with user input.",
      crypto:
        "Use `RandomNumberGenerator` from `System.Security.Cryptography` (not `Random`). Hash passwords with `BCrypt.Net` or PBKDF2.",
      auth:
        "Use `CryptographicOperations.FixedTimeEquals` for constant-time comparison. Configure cookies with HttpOnly + Secure.",
    },
    owaspIndicators: [
      /\bSqlCommand\b/,
      /Parameters\.Add/,
      /AddWithValue/,
      /\bHtmlEncode\b/,
      /\bAntiXss\b/i,
      /Path\.GetFullPath/,
      /Path\.Combine/,
      /Process\.Start/,
      /ArgumentList/,
      /RandomNumberGenerator/,
      /\bBCrypt\b/i,
      /\bPBKDF2\b/i,
      /FixedTimeEquals/,
      /HttpOnly/i,
    ],
  },
  cpp: {
    language: "cpp",
    displayName: "C++",
    fileExtensions: [".cpp", ".cc", ".cxx", ".hpp", ".h"],
    patterns: {
      sqli:
        "Use prepared statements via the database driver (e.g. `sqlite3_bind_text(stmt, idx, value, -1, SQLITE_TRANSIENT)`). NEVER `snprintf` user input into SQL.",
      xss:
        "HTML-encode output via a library (e.g. `libxml2` `xmlEncodeEntitiesReentrant`). Never emit raw user input to HTML.",
      pathTraversal:
        "Use `std::filesystem::canonical(base / input)` and verify it's within `canonical(base)`. Reject `..`.",
      commandInjection:
        "Use `execvp(file, argv[])` (array form). NEVER `system(string)` with user input.",
      crypto:
        "Use `libsodium` `randombytes_buf` or OpenSSL `RAND_bytes`. Hash passwords with `crypto_pwhash` (Argon2). Never `rand()` for security.",
      auth:
        "Use `CRYPTO_memcmp` (OpenSSL) or `sodium_memcmp` for constant-time comparison.",
    },
    owaspIndicators: [
      /sqlite3_bind_/,
      /mysql_stmt_bind_/,
      /\bxmlEncodeEntities/i,
      /std::filesystem::canonical/,
      /std::filesystem::path/,
      /\bexecvp\b/,
      /\bsystem\b/,
      /randombytes_buf/,
      /RAND_bytes/,
      /crypto_pwhash/,
      /\bsodium_memcmp\b/,
      /CRYPTO_memcmp/,
    ],
  },
  rust: {
    language: "rust",
    displayName: "Rust",
    fileExtensions: [".rs"],
    patterns: {
      sqli:
        "Use `sqlx::query!` / `query_as!` (compile-time checked) or `query(\"... WHERE id = $1\").bind(id)`. NEVER `format!` into SQL.",
      xss:
        "Use `html_escape::encode_safe` or `askama` (compile-time template auto-escaping). Never `format!` raw user input into HTML.",
      pathTraversal:
        "Use `Path::new(base).join(input).canonicalize()` and verify `.starts_with(base)`. Reject `..`.",
      commandInjection:
        "Use `std::process::Command::new(cmd).args([...])` (separate args). NEVER `Command::new(\"sh\").arg(\"-c\").arg(format!(...))`.",
      crypto:
        "Use `ring` or `rand::rngs::OsRng` for randomness. Hash passwords with `argon2` or `bcrypt` crates. Never `thread_rng` for long-lived secrets.",
      auth:
        "Use `subtle::ConstantTimeEq` for constant-time comparison. Set HttpOnly + SameSite on cookies via `actix-web` cookie builder.",
    },
    owaspIndicators: [
      /sqlx::query/,
      /\.bind\(/,
      /html_escape/,
      /\baskama\b/,
      /Path::new/,
      /\.canonicalize\(\)/,
      /Command::new/,
      /OsRng/,
      /\bring\b/,
      /\bargon2\b/i,
      /\bbcrypt\b/i,
      /ConstantTimeEq/,
      /subtle::/,
      /HttpOnly/i,
      /SameSite/i,
    ],
  },
};

// ── Language detection ─────────────────────────────────────────────────────
// Best-effort detection from filename extension, falling back to source
// heuristics. Defaults to javascript (the existing pipeline language).

export function detectLanguage(
  filename: string,
  sourceCode: string
): SupportedLanguage {
  const lower = filename.toLowerCase();
  for (const lang of Object.values(LANGUAGE_PATTERNS)) {
    if (lang.fileExtensions.some((ext) => lower.endsWith(ext))) {
      return lang.language;
    }
  }
  // Heuristic fallback
  const src = sourceCode.slice(0, 2000);
  if (/^\s*package\s+\w/m.test(src) && /^\s*import\s+\(/m.test(src)) return "go";
  if (/^\s*func\s+\w/m.test(src)) return "go";
  if (/^\s*def\s+\w/m.test(src) || /^\s*import\s+\w/m.test(src) && /:\s*$/m.test(src)) return "python";
  if (/^\s*(pub\s+)?fn\s+\w/m.test(src)) return "rust";
  if (/^\s*<\?php/m.test(src)) return "php";
  if (/^\s*(public|private|protected)\s+(static\s+)?(class|void|int|String)\s/m.test(src)) return "java";
  if (/^\s*using\s+System/m.test(src)) return "csharp";
  if (/^\s*(module|class)\s+\w.*\bend\b/m.test(src) || /^\s*require\s+['"]/m.test(src)) return "ruby";
  if (/#include\s*[<"]/m.test(src)) return "cpp";
  if (/^\s*import\s+\{[^}]+\}\s+from\s+['"]/m.test(src) || /\binterface\s+\w+\s*\{/m.test(src)) return "typescript";
  return "javascript";
}

// Render the secure-coding guidance for a language as a prompt fragment.
export function renderLanguageGuidance(lang: SupportedLanguage): string {
  const p = LANGUAGE_PATTERNS[lang];
  if (!p) return "";
  return [
    `TARGET LANGUAGE: ${p.displayName}`,
    "Apply OWASP-recommended canonical secure-coding patterns for this language:",
    `- SQL Injection: ${p.patterns.sqli}`,
    `- XSS / Output Encoding: ${p.patterns.xss}`,
    `- Path Traversal: ${p.patterns.pathTraversal}`,
    `- Command Injection: ${p.patterns.commandInjection}`,
    `- Cryptography: ${p.patterns.crypto}`,
    `- Auth / Session: ${p.patterns.auth}`,
  ].join("\n");
}

// Check whether a patch's source actually uses OWASP-recommended patterns
// for the given language. Returns 0..1 — used by the confidence scorer.
export function owaspPatternScore(
  patchedCode: string,
  lang: SupportedLanguage
): number {
  const p = LANGUAGE_PATTERNS[lang];
  if (!p) return 0;
  const code = patchedCode || "";
  let hits = 0;
  for (const re of p.owaspIndicators) {
    if (re.test(code)) hits++;
  }
  // Saturate at 3 distinct indicators → full credit.
  return Math.min(1, hits / 3);
}
