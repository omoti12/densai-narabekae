// 並べ替えた結果を、元の「支払一覧表」と同じ形式（A4縦）のPDFにする。左端に通し番号を付ける。
(function (root) {
  const S = 8;                 // 1mm あたりのピクセル数（約200dpi）
  const PAGE_W = 210, PAGE_H = 297;
  const ROWS_PER_PAGE = 46;    // 見出しの下に並ぶ行数（元の表と同じ）
  const ROW_H = 5.0;
  const TABLE_TOP = 30.2;
  const FONT = '"MS Gothic", "ＭＳ ゴシック", "BIZ UDGothic", "Osaka-Mono", monospace';
  const GRAY = '#d9d9d9';

  // 列の左端（mm）。最後は表の右端
  const X = [5, 12, 28, 60, 77, 98, 125, 145, 171, 195];
  const COLS = [
    { label: 'No.',            align: 'right',  get: (r, n) => String(n) },
    { label: '支払番号',        align: 'right',  get: (r) => r.payNo },
    { label: '支払先 略称',     align: 'left',   get: (r) => r.name },
    { label: '締日',            align: 'left',   get: (r) => r.shime },
    { label: '支払日',          align: 'left',   get: (r) => r.date },
    { label: '支払区分金額(税込)', align: 'right', get: (r) => (r.amount == null ? '' : r.amount.toLocaleString('ja-JP')) },
    { label: '支払区分名',      align: 'left',   get: (r) => r.kubun },
    { label: '支払 備考1',      align: 'left',   get: (r) => r.biko1 },
    { label: '支払 備考2',      align: 'left',   get: (r) => r.biko2 }
  ];

  const px = (mm) => mm * S;
  const font = (pt) => `${pt * 0.3528 * S}px ${FONT}`;

  // 枠に収まらない文字は小さくして収める
  function fitText(ctx, text, x, y, maxW, pt, align) {
    let size = pt;
    ctx.font = font(size);
    while (size > 5 && ctx.measureText(text).width > maxW) {
      size -= 0.5;
      ctx.font = font(size);
    }
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
  }

  function drawPage(pageRows, startNo, pageNo, totalAmount, outDate) {
    const c = document.createElement('canvas');
    c.width = px(PAGE_W);
    c.height = px(PAGE_H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'middle';

    ctx.font = font(22);
    ctx.textAlign = 'center';
    ctx.fillText('支払一覧表', px(100), px(9));

    ctx.font = font(10.5);
    ctx.textAlign = 'right';
    ctx.fillText(`出力日：${outDate}`, px(X[X.length - 1]), px(27.5));

    const rowY = (i) => TABLE_TOP + ROW_H * (i + 1); // i 行目の上端（見出しが 0 段目）

    // 見出しと合計行の網かけ
    ctx.fillStyle = GRAY;
    ctx.fillRect(px(X[0]), px(TABLE_TOP), px(X[X.length - 1] - X[0]), px(ROW_H));
    if (totalAmount != null) {
      const ti = pageRows.length;
      ctx.fillRect(px(X[0]), px(rowY(ti)), px(X[X.length - 1] - X[0]), px(ROW_H));
    }
    ctx.fillStyle = '#000';

    // 見出し
    COLS.forEach((col, ci) => {
      const w = X[ci + 1] - X[ci];
      fitText(ctx, col.label, px(X[ci] + w / 2), px(TABLE_TOP + ROW_H / 2), px(w - 1), 10.5, 'center');
    });

    // 明細
    const PAD = 0.8;
    pageRows.forEach((r, i) => {
      const cy = px(rowY(i) + ROW_H / 2);
      COLS.forEach((col, ci) => {
        const text = col.get(r, startNo + i) || '';
        if (!text) return;
        const x = col.align === 'right' ? px(X[ci + 1] - PAD) : px(X[ci] + PAD);
        fitText(ctx, text, x, cy, px(X[ci + 1] - X[ci] - PAD * 2), 11, col.align);
      });
    });

    // 合計
    if (totalAmount != null) {
      const ci = 5;
      fitText(ctx, totalAmount.toLocaleString('ja-JP'), px(X[ci + 1] - PAD), px(rowY(pageRows.length) + ROW_H / 2),
        px(X[ci + 1] - X[ci] - PAD * 2), 11, 'right');
    }

    // 罫線
    ctx.strokeStyle = '#000';
    ctx.lineWidth = px(0.2);
    const bottom = rowY(ROWS_PER_PAGE - 1) + ROW_H;
    ctx.beginPath();
    for (let i = 0; i <= ROWS_PER_PAGE; i++) {
      const y = px(TABLE_TOP + ROW_H * i);
      ctx.moveTo(px(X[0]), y);
      ctx.lineTo(px(X[X.length - 1]), y);
    }
    X.forEach((x) => {
      ctx.moveTo(px(x), px(TABLE_TOP));
      ctx.lineTo(px(x), px(bottom));
    });
    ctx.stroke();

    ctx.font = font(10.5);
    ctx.textAlign = 'center';
    ctx.fillText(`-${pageNo}-`, px(100), px(277));
    return c;
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  // rows: 並べ替え済みの行。合計は金額のある行の合計
  function buildPdf(rows) {
    const { jsPDF } = root.jspdf;
    const hasAmount = rows.some((r) => r.amount != null);
    const total = hasAmount ? rows.reduce((a, r) => a + (r.amount || 0), 0) : null;
    // 合計行の分を空けてページに分ける
    const pages = [];
    for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) pages.push(rows.slice(i, i + ROWS_PER_PAGE));
    if (!pages.length) pages.push([]);
    if (total != null && pages[pages.length - 1].length >= ROWS_PER_PAGE) pages.push([]);

    const outDate = today();
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    let no = 1;
    pages.forEach((pr, pi) => {
      if (pi > 0) doc.addPage();
      const isLast = pi === pages.length - 1;
      const canvas = drawPage(pr, no, pi + 1, isLast ? total : null, outDate);
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, PAGE_W, PAGE_H, undefined, 'FAST');
      no += pr.length;
    });
    return doc;
  }

  function fileName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `支払一覧表_でんさい順_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.pdf`;
  }

  root.DensaiPdf = { buildPdf, fileName };
})(window);
