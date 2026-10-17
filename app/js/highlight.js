/* DevNullHighlight: a port of tempest/highlight 2.28.1 (the PHP highlighter dev-null.sh runs server-side) for
 * php, bash/sh/shell, js/javascript/node, ts/typescript and json, so code blocks get the site's token classes.
 *
 *   DevNullHighlight.supports(lang)     -> true for the names and aliases above (case-sensitive, like tempest;
 *                                          the site lowercases the first word of the fence info string).
 *   DevNullHighlight.tokenize(code, lang) -> Array of segments, each one of
 *       { text: "..." }                    plain text
 *       { type: "keyword", text: "..." }   a token holding only text
 *       { type: "type", children: [...] }  a token holding nested segments (tempest's canContain nesting)
 *     type is tempest's CSS class without "hl-": keyword, type, generic, property, value, number, literal,
 *     variable, comment, attribute, operator, addition, deletion, and blur/em/strong (or a custom class) from
 *     the marker syntax. Build DOM with createTextNode only; nothing here is HTML.
 *
 * It mirrors tempest step by step, including its quirks: injections rewrite the code into tempest's own markup
 * (span tags spelled with the sentinel characters ❶❷❸❹ and ❿ around injected parts), later patterns run over
 * that markup exactly as in PHP, and the finished markup is parsed into segments at the end. The sentinels are
 * stripped from the input first, as tempest does, so input can never forge a tag. The marker syntax works too:
 * {+ +} addition, {- -} deletion, {~ ~} blur, {_ _} em, {* *} strong, {:class: … :}. No gutter.
 * Known gaps: heredocs labelled with languages tempest has but this file doesn't (SQL, HTML, …) fall back to
 * plain text; PCRE's backtrack limit (which makes PHP skip a pattern on huge inputs) isn't emulated. */
(function () {
  "use strict";

  var LT = "❷", GT = "❸", QUOT = "❹", INJ = "❿"; // ❶ (tempest's &) only needs stripping
  var SENTINELS = /[❶-❹❿]/g;
  var CLOSE = LT + "/span" + GT;
  var HIDDEN = "hidden";
  var ENUM = /^(keyword|operator|type|value|variable|property|attribute|generic|number|literal|comment|injection)$/;

  // Types starting with "=" are tempest's DynamicTokenType (marker classes), which nest by a different rule.
  function typeValue(t) { return t.charAt(0) === "=" ? t.slice(1) : t; }

  function open(t) {
    if (t === HIDDEN) return LT + "span style=" + QUOT + "display: none" + QUOT + GT;
    return LT + "span class=" + QUOT + (ENUM.test(t) ? "hl-" + t : typeValue(t)) + QUOT + GT;
  }

  // TokenTypeEnum::canContain and DynamicTokenType::canContain.
  function canContainType(a, b) {
    if (a.charAt(0) === "=") return a.slice(1) !== typeValue(b);
    if (a === b) return false;
    var v = typeValue(b);
    if (a === "type") return v !== "keyword" && v !== "property";
    if (a === "generic") return v !== "type";
    return a === "attribute";
  }

  function replaceAll(subject, search, replacement) {
    return search === "" ? subject : subject.split(search).join(replacement);
  }

  // PCRE's \s (without /u) is ASCII whitespace only; JS's also covers NBSP and other Unicode spaces.
  function asciiSpace(src) {
    var out = "", inClass = false;
    for (var i = 0; i < src.length; i++) {
      var c = src.charAt(i);
      if (c === "\\") {
        var n = src.charAt(++i);
        out += n === "s" ? (inClass ? "\\t-\\r " : "[\\t-\\r ]") : c + n;
      } else {
        if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        out += c;
      }
    }
    return out;
  }

  // Without the RegExp d flag, the `match` group's offset comes from capturing everything before it as group 1.
  // Every pattern has (?<match> at the top level, so the prefix is a balanced expression.
  function pattern(type, re) {
    var src = asciiSpace(re.source), at = src.indexOf("(?<match>");
    return { type: type, re: new RegExp("(" + src.slice(0, at) + ")" + src.slice(at), "g" + (re.multiline ? "m" : "")) };
  }

  function keywords(list, tail) {
    var unique = list.filter(function (k, i) { return list.indexOf(k) === i; });
    unique.sort(function (a, b) { return b.length - a.length; });
    return new RegExp(tail[0] + "(?<match>(?:" + unique.join("|") + "))" + tail[1]);
  }

  // ── patterns, in tempest's order (order breaks ties when grouping) ─────────────────────────────────────

  var BASE = [
    ["ignore", /(?<match>{\+)/], ["ignore", /(?<match>\+})/],
    ["ignore", /(?<!\{)(?<match>{\-)(?!-)/], ["ignore", /(?<!-)(?<match>\-})(?!})/],
    ["injection", /❿(?<match>(.|\n)*?)❿/]
  ];
  var PHP_KEYWORDS = ["null", "parent", "true", "false", "__halt_compiler", "abstract", "and", "as", "break",
    "callable", "case", "catch", "class", "clone", "const", "continue", "declare", "default", "die", "do", "echo",
    "else", "elseif", "empty", "enum", "enddeclare", "endfor", "endforeach", "endif", "endswitch", "endwhile",
    "eval", "exit", "extends", "final", "finally", "fn", "for", "foreach", "function", "global", "goto", "if",
    "implements", "include", "include_once", "instanceof", "insteadof", "interface", "isset", "list", "match",
    "namespace", "new", "or", "print", "private", "protected", "public", "readonly", "require", "require_once",
    "return", "static", "switch", "throw", "trait", "try", "unset", "use", "while", "xor", "yield", "yield from"];
  var PHP_KEYWORD_TAIL = ["\\b(?<!$)(?<!->)", "($|,|\\)|;|:|\\s|\\()"];
  var PHP_COMMENTS = [["comment", /(?<match>\/\*(.|\n)*?\*\/)/m], ["comment", /(?<match>(?:\/\/|#[^\[])(.)*)/]];
  var PHP_CLASS_PROPERTY = ["property", /(public|private|protected)(\(set\))?(\s(.+?)) (?<match>\$[\w]+)/];
  var PHP_NEW = ["type", /new (?<match>[\w\\]+)/];
  var PHP_ASYMMETRIC = ["keyword", /(public|private|protected)\((?<match>set)\)/];
  var VARIABLE = ["variable", /(?<match>\$[\w]+)/];
  var QUOTES = [["value", /(?<match>'(\\'|.)*?')/], ["value", /(?<match>"(\\"|.)*?")/]];

  var PHP = [
    ["type", /\((?<match>(string|int|integer|void|bool|boolean|float|double|real|binary|array|object|unset))\)/],
    ["keyword", /(?<match>\<\?[=|php]+)/], ["keyword", /(?<match>\?\>+)/],
    ["property", /use function [\w\\]+\\(?<match>[\w]+);/], ["type", /use function (?<match>[\w\\]+\\)[\w]+\;/],
    ["type", /(class|interface|trait|enum) (?<match>[\w]+)/], ["property", /(?<match>[\w]+):\s/],
    ["operator", /\s(?<!\$)(?<match>&&)(\s|\()/], ["operator", /\s(?<!\$)(?<match>\|\|)(\s|\()/],
    ["operator", /\s(?<!\$)(?<match><=>)(\s|\()/], ["operator", /\s(?<!\$)(?<match>\?)(\s|\()/],
    ["property", /function (?<match>[\w]+)/], PHP_ASYMMETRIC,
    ["keyword", keywords(PHP_KEYWORDS, PHP_KEYWORD_TAIL)],
    ["keyword", /\:\:(?<match>class)/], ["keyword", /(?<match>fn)\&/],
    ["keyword", /(?<match>set)\s*({|;|=>|\()/], ["keyword", /(?<match>get)\s*({|=>|;)/],
    ["keyword", /(?<match>namespace)\\/]
  ].concat(PHP_COMMENTS, [
    ["type", /(^[\s]*|\#\[)(?<match>[\\]*[A-Z][\w\\]+)/m], ["type", /implements(?<match>[\s\,\w]+)/],
    ["type", /extends\s(?<match>[\w]+)/], ["type", /use (?<match>[\w\\]+)/],
    ["type", /namespace (?<match>[\w\\]+)/],
    // tempest has (\s(?<match>[^\s]*)) here; the outer group is unused, so it is dropped to keep match top-level.
    ["type", /(public|private|protected)(\s*readonly\s*)?(\s*static\s*)?(\s*\((get|set)\)\s*)?\s(?<match>[^\s]*) (\$[\w]+)/],
    ["type", /const\s(?<match>.+?)\s[\w]+\s=/], ["type", /\)\s*\:\s*(?<match>[\w\(\)\&\|\?]+)[\s{;\n]/],
    ["type", /(?<!\$)(?<match>[\\\w]+)\:\:/], PHP_NEW, ["type", /instanceof\s(?<match>[\w\\]+)/],
    ["type", /use [\w\\]+ as (?<match>[\w]+)/], ["type", /catch\s*\((?<match>[\w\||]+)(\)|\s)/],
    ["type", /enum [\w]+\:(\s)*(?<match>int|string)/], ["type", /(?<match>\(\w+(&\w+)+\))/],
    ["type", /set\s*\((?<match>[\w]+)/], ["property", /(?<match>[\w\\]*\{closure\})\(/],
    PHP_CLASS_PROPERTY, ["property", /->(?<match>[\w]+)/], ["property", /(\s|\()(?<match>[\w]+)\(/],
    ["property", /\b(?<match>[a-z][\w]+)\(/], ["property", /\:\:(?<match>[\w]+)/],
    ["property", /\b(?<match>[A-Z_]+)\b/], ["property", /(public|private|protected)\s(?<match>\$[\w]+)/],
    ["property", /case (?<match>[\w]+)(\s)*(=|;)/], ["property", /\:\:(?<match>\$[\w]+)/], VARIABLE
  ], QUOTES);

  var PHP_TYPE = PHP_COMMENTS.concat([
    ["keyword", keywords(["public", "private", "protected", "null", "true", "false", "new", "readonly"], PHP_KEYWORD_TAIL)],
    ["type", /(?<match>[\w\&\(\)\|\\\?]+)\s+(\.*)\$/], PHP_CLASS_PROPERTY, PHP_NEW, PHP_ASYMMETRIC
  ]);

  var DOC_TAG = ["value", /(?<match>\@[\w]+)/];
  var PHP_DOC = [DOC_TAG,
    ["type", /\@param(\s)+(?<match>.*?) \$/], ["type", /\@var(\s)+(?<match>.*?)( \$|\*|$)/],
    ["type", /\@return\s*(?<match>.*?)(\s*\*\/|$)/],
    ["type", /\@return(\s)+(?<match>.*?)(\*\/|$|\r\n|[\n\x0b\f\r\x85])/],
    ["generic", /\@template(\s)+(?<match>[\w]+)/], ["generic", /\<(?<match>[\w]+)\>/], VARIABLE];

  var BASH = [
    ["comment", /(?<match>\#!\/.*)/], ["comment", /(^|[^\\])(?<match>#.*)/]
  ].concat(QUOTES, [
    ["keyword", /\b(?<match>(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|return|in|select|until|break|continue|declare|local|export|readonly|unset|shift|trap|source))\b/],
    ["type", /\b(?<match>(?:echo|printf|cd|pwd|test|eval|exec|set|read|exit))\b/],
    ["variable", /(?<match>\$\{[^}]+\}|\$[a-zA-Z_]\w*|\$[\d@?#!\$\-\*])/],
    ["operator", /(?<match>\|\||&&|>>|<<|;;|[|><;])/], ["number", /\b(?<match>\d+)\b/],
    ["generic", /(?<match>(?<![\w-])--?[a-zA-Z][\w-]*)/]
  ]);

  var JS_KEYWORD_TAIL = ["\\b(?<!\\.)", "(,|\\.|\\)|;|:|\\s|\\()"];
  var JS = [
    ["keyword", keywords(["set", "of", "get", "from", "eval", "async", "as", "break", "case", "catch", "class",
      "const", "continue", "debugger", "default", "delete", "do", "else", "export", "extends", "false", "finally",
      "for", "function", "if", "import", "in", "instanceof", "new", "null", "return", "super", "switch", "this",
      "throw", "true", "try", "typeof", "var", "void", "while", "with", "let", "static", "yield", "await", "enum",
      "implements", "interface", "package", "private", "protected", "public", "constructor"], JS_KEYWORD_TAIL)],
    ["comment", /(?<match>\/\*(.|\n)*?\*\/)/m], ["comment", /(?<match>\/\/(.)*)/],
    ["type", /class (?<match>[\w]+)/], ["type", /new (\w+\.)*(?<match>[\w]+)(\s)*\(/],
    ["type", /\b(?<match>[A-Z][\w]+)\./], ["property", /\.(?<match>[\w]+)/],
    ["property", /[\s]*(?<match>[\w]+)\:/], ["property", /(?<match>[\w\$]+)\(/],
    ["property", /static (?<match>[\w]+)/]
  ].concat(QUOTES);

  var TS = JS.concat([
    ["keyword", keywords(["type", "declare", "readonly", "namespace", "keyof", "infer", "satisfies", "abstract",
      "is", "module", "override", "asserts"], JS_KEYWORD_TAIL)],
    ["type", /\b(?<!\.)(?<match>string|number|boolean|any|unknown|never|bigint|symbol|object|undefined)\b/],
    ["type", /(?<=[\w\)\]])\s*:\s*(?<match>[A-Z][\w]*(?:\.[A-Z][\w]*)*(?:\[\])?)/],
    ["attribute", /(?<match>@[A-Za-z_][\w]*)/], ["generic", /(?<=\w)(?<match><[A-Z'"][\w\s,\.\[\]'"|]*>)/],
    ["property", /(?<match>[\w\$]+)<[A-Z'"][\w\s,\.\[\]'"|]*>\(/]
  ]);

  var JSON_PATTERNS = [
    ["keyword", /(?<match>\"[\w\\\-]+\")(\s)*\:/], ["property", /(?<match>(\{|\}))/],
    ["property", /(?<match>(\[|\]))/], ["value", /(?<match>\".*?\")/]
  ];

  var JS_DOC = [DOC_TAG, ["type", /(?<match>\{(.*?)\})/], ["value", /@param\s(.*?)\s(?<match>(.*?))(\s|$)/]];

  // ── injections: functions (content) -> { content, tokens? } ──────────────────────────────────────────

  // IsHighlightInjection: hides the markers and wraps the inside in a dynamic token.
  function marker(re, cls) {
    return function (content) {
      var tokens = [], m;
      re.lastIndex = 0;
      while ((m = re.exec(content))) {
        var inner = m.index + m[1].length;
        tokens.push(token(m.index, m[1], HIDDEN), token(inner, m[2], "=" + cls),
          token(inner + m[2].length, m[3], HIDDEN));
      }
      return { content: content, tokens: tokens };
    };
  }

  // CustomClassInjection, including its offset bookkeeping (it strips every marker as it goes).
  function customClass(content) {
    var re = /(\{:([\w-]+):)((?:.|\n)*?)(:\})/g, found = [], tokens = [], extra = 0, m;
    while ((m = re.exec(content))) found.push(m);
    found.forEach(function (m) {
      extra += m[1].length;
      tokens.push(token(m.index + m[1].length - extra, m[3], "=" + m[2]));
      extra += m[4].length;
      content = replaceAll(replaceAll(content, m[1], ""), m[4], "");
    });
    return { content: content, tokens: tokens };
  }

  // IsInjection: replaces the `match` group inside each full match with fn's output.
  function rewrite(re, fn) {
    re = new RegExp(asciiSpace(re.source), re.flags);
    return function (content) {
      return {
        content: content.replace(re, function (full) {
          var inner = arguments[arguments.length - 1].match;
          if (!inner || inner === "0") return full;
          return replaceAll(full, inner, fn(inner));
        })
      };
    };
  }

  function injected(markup) { return INJ + markup + INJ; }

  var phpDocComment = rewrite(/(?<match>\/\*\*(.|\n)*?\*\/)/gm, function (c) { return parse(c, LANG.phpdoc, true); });
  var phpAttributePlain = rewrite(/(?<match>\#\[[\w]+\])/g, function (c) {
    return open("attribute") + "#[" + parse(replaceAll(replaceAll(c, "#[", ""), "]", ""), "php", true) + "]" + CLOSE;
  });
  var phpAttributeInstance = rewrite(/(?<match>\#\[[\w]+\((.|\n)*?\)\])/g, function (c) {
    var inner = parse(replaceAll(replaceAll(c, "#[", ""), ")]", ""), "php", true);
    return injected(open("attribute") + "#[" + inner + ")]" + CLOSE);
  });
  var phpFunctionParameters = rewrite(/(function|fn)[\s\w]*\((?<match>(.|\n)*?)(use\s*\(|{|\)[\s]*({|;|:|=>))/g,
    function (c) { return injected(parse(c, LANG.phptype, true)); });

  // PhpHeredocInjection: the body is highlighted as the language its label names, the labels as properties.
  function phpHeredoc(content) {
    var labels = [], re = /<<<(\w+)\b/g, m;
    while ((m = re.exec(content))) labels.push(m[1]);
    labels.forEach(function (label) {
      var block = new RegExp("<<<" + label + "((?:.|\\n)*?)" + label + "(?:;|[\\t-\\r ]|\\))", "g"), found = [];
      while ((m = block.exec(content))) found.push(m);
      found.forEach(function (m) {
        var tag = open("property") + label + CLOSE;
        var parsed = replaceAll(m[0], m[1], injected(parse(m[1], label.toLowerCase(), true)));
        parsed = replaceAll(replaceAll(parsed, "<<<" + label, "<<<" + tag), label + ";", tag + ";");
        content = replaceAll(content, m[0], parsed);
      });
    });
    return { content: content };
  }

  // PhpGenericTypeInjection: names from @template and <T> become generics wherever they appear.
  function phpGenericType(content) {
    var names = [], m;
    var templates = /\@template(\s)+([\w]+)/g, generics = /\<([\w]+)\>/g;
    while ((m = templates.exec(content))) if (names.indexOf(m[2]) < 0) names.push(m[2]);
    while ((m = generics.exec(content))) if (names.indexOf(m[1]) < 0) names.push(m[1]);
    names.forEach(function (name) {
      content = content.replace(new RegExp("\\b" + name + "\\b", "g"), open("generic") + name + CLOSE);
    });
    return { content: content };
  }

  // AdditionInjection / DeletionInjection run on the rendered markup, wrapping each line of the block.
  function lineWrap(start, end, re, cls) {
    return function (content) {
      var ignored = open("ignore");
      content = replaceAll(content, ignored + start + CLOSE, start);
      content = replaceAll(content, ignored + end + CLOSE, end);
      return content.replace(re, function (block) {
        return replaceAll(replaceAll(replaceAll(block, start, open("=" + cls)), "\n", CLOSE + "\n" + open("=" + cls)), end, CLOSE);
      });
    };
  }

  var BEFORE = [
    marker(/(\{~)((?:.|\n)*?)(~\})(?!\})/g, "hl-blur"),
    marker(/(\{_)((?:.|\n)*?)(_\})(?!\})/g, "hl-em"),
    marker(/(\{\*)((?:.|\n)*?)(\*\})(?!\})/g, "hl-strong"),
    customClass
  ];
  var AFTER = [
    lineWrap("{+", "+}", /(\{\+)((?:.|\n)*?)(\+\})/g, "hl-addition"),
    lineWrap("{-", "-}", /(?<!\{)(\{-)(?!-)((?:.|\n)*?)(-\})(?!\})/g, "hl-deletion")
  ];

  function language(patterns, injections) {
    return {
      patterns: BASE.concat(patterns).map(function (p) { return pattern(p[0], p[1]); }),
      injections: BEFORE.concat(injections || [])
    };
  }

  var js = language(JS, [rewrite(/(?<match>\/\*\*(.|\n)*?\*\/)/gm, function (c) { return parse(c, LANG.jsdoc, true); })]);
  var LANG = {
    text: language([]),
    phpdoc: language(PHP_DOC, [phpGenericType]),
    phptype: language(PHP_TYPE, [phpAttributePlain, phpAttributeInstance, phpDocComment]),
    jsdoc: language(JS_DOC)
  };
  var REGISTRY = {
    php: language(PHP, [phpHeredoc, phpDocComment, phpAttributePlain, phpAttributeInstance, phpFunctionParameters]),
    bash: language(BASH),
    js: js,
    ts: { patterns: language(TS).patterns, injections: js.injections },
    json: language(JSON_PATTERNS)
  };
  REGISTRY.sh = REGISTRY.shell = REGISTRY.bash;
  REGISTRY.javascript = REGISTRY.node = REGISTRY.js;
  REGISTRY.typescript = REGISTRY.ts;

  // ── tokens: ParseTokens, GroupTokens, RenderTokens ─────────────────────────────────────────────────────

  function token(offset, value, type) {
    return { offset: offset, value: value, type: type, end: offset + value.length, children: [], parent: null };
  }

  function parseTokens(content, patterns) {
    var tokens = [], seen = {};
    patterns.forEach(function (p) {
      var re = p.re, m;
      re.lastIndex = 0;
      while ((m = re.exec(content))) {
        if (m[0] === "") re.lastIndex++;
        var value = m.groups.match, offset = m.index + m[1].length;
        if (value === undefined) continue;
        var key = offset + ":" + typeValue(p.type) + ":" + value;
        if (seen[key]) continue;
        seen[key] = true;
        tokens.push(token(offset, value, p.type));
      }
    });
    return tokens;
  }

  // Tokens that overlap an earlier one either nest in it (one level, if its type allows) or are dropped.
  function groupTokens(tokens) {
    if (tokens.length <= 1) return tokens;
    tokens.forEach(function (t, i) { t.index = i; });
    tokens.sort(function (a, b) { return a.offset - b.offset || b.end - a.end || a.index - b.index; });
    var grouped = [], removed = {};
    for (var i = 0; i < tokens.length; i++) {
      if (removed[i]) continue;
      var t = tokens[i];
      t.children = [];
      t.parent = null;
      for (var j = i + 1; j < tokens.length; j++) {
        if (removed[j]) continue;
        var other = tokens[j];
        if (other.offset >= t.end) break;
        if (canContain(t, other)) {
          t.children.push(other);
          other.parent = t;
        }
        removed[j] = true;
      }
      if (!t.parent) grouped.push(t);
    }
    return grouped;
  }

  function canContain(t, other) {
    for (var i = 0; i < t.children.length; i++) {
      var c = t.children[i];
      if (c.offset === other.offset && c.end === other.end) return false;
    }
    return canContainType(t.type, other.type);
  }

  function renderTokens(content, tokens, base) {
    var parts = [], cursor = 0;
    tokens.forEach(function (t) {
      var at = t.offset - base;
      if (at > cursor) parts.push(content.substring(cursor, at));
      parts.push(open(t.type), t.children.length ? renderTokens(t.value, t.children, t.offset) : t.value, CLOSE);
      cursor = at + t.value.length;
    });
    if (cursor < content.length) parts.push(content.slice(cursor));
    return parts.join("");
  }

  // Highlighter::parse. Nested calls (injections) return markup; the outer call also runs the after-injections.
  function parse(content, lang, nested) {
    if (typeof lang === "string") lang = REGISTRY[lang] || LANG.text;
    if (!nested) content = content.replace(SENTINELS, "");
    content = content.replace(/\r\n|\r/g, "\n");
    var tokens = [];
    lang.injections.forEach(function (inject) {
      var result = inject(content);
      content = result.content;
      if (result.tokens) tokens = tokens.concat(result.tokens);
    });
    tokens = tokens.concat(parseTokens(content, lang.patterns));
    content = renderTokens(content, groupTokens(tokens), 0);
    if (!nested) AFTER.forEach(function (inject) { content = inject(content); });
    return content;
  }

  // ── markup -> segments ─────────────────────────────────────────────────────────────────────────────────

  var TAG = new RegExp(LT + "span (?:class=" + QUOT + "([^" + LT + GT + QUOT + "]*)" + QUOT +
    "|style=" + QUOT + "display: none" + QUOT + ")" + GT + "|" + CLOSE, "g");
  var UNESCAPE = { "❶": "&", "❷": "<", "❸": ">", "❹": "\"" };

  function toSegments(markup) {
    markup = markup.split(INJ).join("");
    var root = { kids: [] }, stack = [root], last = 0, m;
    function text(s) {
      if (s) stack[stack.length - 1].kids.push(s.replace(/[❶-❹]/g, function (c) { return UNESCAPE[c]; }));
    }
    TAG.lastIndex = 0;
    while ((m = TAG.exec(markup))) {
      text(markup.slice(last, m.index));
      last = TAG.lastIndex;
      if (m[0] === CLOSE) {
        if (stack.length > 1) stack.pop();
      } else {
        var node = { cls: m[1], kids: [] };
        stack[stack.length - 1].kids.push(node);
        stack.push(node);
      }
    }
    text(markup.slice(last));
    return finish(root.kids, []);
  }

  // Hidden spans vanish; injection and ignore spans unwrap; a token holding only text becomes { type, text }.
  function finish(kids, out) {
    kids.forEach(function (kid) {
      if (typeof kid === "string") return pushText(out, kid);
      if (kid.cls === undefined) return;
      if (kid.cls === "hl-injection" || kid.cls === "ignore") return finish(kid.kids, out);
      var children = finish(kid.kids, []), type = kid.cls.replace(/^hl-/, "");
      if (!children.length) return;
      if (children.length === 1 && children[0].type === undefined) out.push({ type: type, text: children[0].text });
      else out.push({ type: type, children: children });
    });
    return out;
  }

  function pushText(out, s) {
    var prev = out[out.length - 1];
    if (prev && prev.type === undefined) prev.text += s;
    else out.push({ text: s });
  }

  window.DevNullHighlight = {
    supports: function (lang) {
      return Object.prototype.hasOwnProperty.call(REGISTRY, lang);
    },
    tokenize: function (code, lang) {
      code = String(code);
      if (!Object.prototype.hasOwnProperty.call(REGISTRY, lang)) return [{ text: code }];
      return toSegments(parse(code, lang, false));
    }
  };
})();
