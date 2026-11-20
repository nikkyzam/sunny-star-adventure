/**
 * certificate.ts — the Royal Explorer certificate for collecting every Sunny Castle sticker.
 * Drawn on a canvas and shown in the photo album, so saving or printing it sits behind the same
 * grown-up maths question as photos. It never carries a name: there's a line to write one on
 * once it's printed.
 */

export function royalCertificate(icons: string[], when = new Date()): HTMLCanvasElement {
  const W = 1200, H = 850;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const font = `"Comic Sans MS", "Chalkboard SE", "Baloo 2", "Segoe UI", sans-serif`;
  // parchment and a double gold border
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#fffaf0");
  bg.addColorStop(1, "#fbecc8");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "#e8b830";
  g.lineWidth = 18;
  g.strokeRect(22, 22, W - 44, H - 44);
  g.strokeStyle = "#c48a12";
  g.lineWidth = 4;
  g.strokeRect(50, 50, W - 100, H - 100);
  g.textAlign = "center";
  g.textBaseline = "middle";
  // the crown and the title
  g.font = `110px ${font}`;
  g.fillText("👑", W / 2, 140);
  g.fillStyle = "#6c3fc4";
  g.font = `bold 64px ${font}`;
  g.fillText("Royal Explorer", W / 2, 245);
  g.fillStyle = "#7a4a00";
  g.font = `32px ${font}`;
  g.fillText("of Sunny Castle", W / 2, 300);
  // a line to write a name on (the game never asks for one)
  g.font = `28px ${font}`;
  g.fillText("This is to say that", W / 2, 365);
  g.strokeStyle = "#7a4a00";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(W / 2 - 300, 430);
  g.lineTo(W / 2 + 300, 430);
  g.stroke();
  g.fillText("found every one of the castle's 20 stickers!", W / 2, 478);
  // the stickers in two rows
  g.font = `48px ${font}`;
  const per = Math.ceil(icons.length / 2);
  icons.forEach((ic, i) => {
    const row = Math.floor(i / per), col = i % per;
    g.fillText(ic, W / 2 + (col - (per - 1) / 2) * 92, 555 + row * 70);
  });
  // the verse, the date and the game's name
  g.fillStyle = "#4a3b6b";
  g.font = `italic 28px ${font}`;
  g.fillText("“Well done, good and faithful servant.” (Matthew 25:21)", W / 2, 715);
  g.fillStyle = "#9a7a3a";
  g.font = `24px ${font}`;
  g.fillText(`${when.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} · Sunny Star Adventure ⭐`, W / 2, 770);
  return c;
}
