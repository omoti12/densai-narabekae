// 支払一覧の読み取りと、でんさい登録名との照合（画面に依存しない処理）
(function (root) {
  // 会社名を比較用にそろえる：半角カナ→全角、法人格・記号・空白を取り除く
  function normalize(s) {
    return String(s || '')
      .normalize('NFKC')
      .replace(/株式会社|有限会社|合同会社|合資会社|合名会社|\(株\)|\(有\)|\(同\)/g, '')
      .replace(/\(カ\)?$|^\(カ\)/, '')
      .replace(/[\s・.,，。、\-‐－()「」]/g, '')
      .toUpperCase();
  }

  // 支払一覧の1行を読み取る。例：「1345 春日技研電機 末日締 2026/10/31 892,870 でんさい」
  const ROW = /^\s*(\d{3,8})\s+(.+?)\s+(?:(\S*締)\s+)?(\d{4}\s?\/\s?\d{1,2}\s?\/\s?\d{1,2})\s+(\d{1,3}(?:,\s?\d{3})+|\d+)\s*(.*)$/;
  const TOTAL = /^\s*(\d{1,3}(?:,\s?\d{3})+)\s*$/;

  function parseLines(lines) {
    const rows = [];
    let total = null;
    const clean = lines.map((l) => String(l).replace(/\t+/g, '  ').replace(/　/g, ' ').trimEnd());
    const strict = clean.some((l) => ROW.test(l));
    for (const line of clean) {
      if (!line.trim()) continue;
      if (strict) {
        const m = line.match(ROW);
        if (m) {
          // 金額の後ろは「支払区分名」「備考1」「備考2」
          const rest = m[6].trim() ? m[6].trim().split(/\s{2,}/) : [];
          rows.push({
            payNo: m[1],
            name: m[2].trim(),
            shime: m[3] || '',
            date: m[4].replace(/\s/g, ''),
            amount: parseInt(m[5].replace(/\D/g, ''), 10),
            kubun: rest[0] || '',
            biko1: rest[1] || '',
            biko2: rest.slice(2).join(' ')
          });
        } else {
          const t = line.match(TOTAL);
          if (t) total = parseInt(t[1].replace(/\D/g, ''), 10);
        }
      } else {
        // 会社名だけを1行ずつ貼った場合
        const name = line.split(/\s{2,}/)[0].trim();
        if (name) rows.push({ payNo: '', name, shime: '', date: '', amount: null, kubun: '', biko1: '', biko2: '' });
      }
    }
    return { rows, total };
  }

  function createMatcher(master) {
    const norm = master.map(normalize);

    function lookup(key) {
      if (key.length < 2) return null;
      const exact = [];
      norm.forEach((m, i) => { if (m === key) exact.push(i); });
      if (exact.length) return { candidates: exact };
      const partial = [];
      norm.forEach((m, i) => { if (m.length >= 2 && (m.includes(key) || key.includes(m))) partial.push(i); });
      if (partial.length) return { candidates: partial };
      return null;
    }

    // aliases: { 正規化した略称: 登録名 }（手動で選んだ対応）
    function match(name, aliases) {
      const nk = normalize(name);
      if (aliases && aliases[nk] != null) {
        const idx = master.indexOf(aliases[nk]);
        if (idx >= 0) return { index: idx, status: 'manual', candidates: [idx] };
      }
      // 「テクノ菱和 東京」のように後ろに支店名などが付く場合は、前から順に短くして探す
      const tokens = String(name).normalize('NFKC').trim().split(/\s+/);
      const keys = [nk];
      for (let n = tokens.length - 1; n >= 1; n--) keys.push(normalize(tokens.slice(0, n).join(' ')));
      for (const key of keys) {
        const r = lookup(key);
        if (r) {
          return {
            index: r.candidates[0],
            status: r.candidates.length === 1 ? 'ok' : 'ambiguous',
            candidates: r.candidates
          };
        }
      }
      return { index: -1, status: 'none', candidates: [] };
    }

    // でんさいの順番に並べる。見つからない行は最後にまとめる
    function sort(rows, aliases) {
      const withMatch = rows.map((r, i) => ({ ...r, order: i, match: match(r.name, aliases) }));
      return withMatch.sort((a, b) => {
        const ai = a.match.index < 0 ? Infinity : a.match.index;
        const bi = b.match.index < 0 ? Infinity : b.match.index;
        return ai - bi || a.order - b.order;
      });
    }

    return { match, sort, normalize };
  }

  const api = { normalize, parseLines, createMatcher };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DensaiMatcher = api;
})(typeof window !== 'undefined' ? window : globalThis);
