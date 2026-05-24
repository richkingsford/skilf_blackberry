const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "assets", "skilf-thumbnails");
const skillTreePath = path.join(root, "skill-tree.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function flattenSkillTree(tree) {
  const out = [];
  for (const [category, value] of Object.entries(tree)) {
    if (Array.isArray(value)) {
      for (const skill of value) out.push({ category, group: category, skill });
    } else {
      for (const [group, skills] of Object.entries(value)) {
        for (const skill of skills) out.push({ category, group, skill });
      }
    }
  }
  return out;
}

function hash(value) {
  let h = 2166136261;
  for (const char of value) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const palettes = [
  ["#55d3c4", "#d4a94b", "#315a9f", "#ff8c73"],
  ["#ff8c73", "#9c83ff", "#2c6d8f", "#f2c14e"],
  ["#7be0b1", "#f2c14e", "#264f73", "#70a1ff"],
  ["#70a1ff", "#e28bff", "#1f6f78", "#ff8c73"],
  ["#f7b267", "#55d3c4", "#5a4fcf", "#f472b6"],
  ["#6ee7b7", "#60a5fa", "#f59e0b", "#fb7185"],
  ["#f472b6", "#38bdf8", "#8b5cf6", "#facc15"],
  ["#facc15", "#34d399", "#2563eb", "#fb7185"],
  ["#fb7185", "#c084fc", "#0f766e", "#facc15"],
  ["#a3e635", "#f97316", "#3b82f6", "#55d3c4"],
];

const layouts = [
  [[116, 108, 1.08, -5], [246, 94, 0.84, 7], [268, 154, 0.58, 0]],
  [[184, 104, 1.1, 0], [82, 74, 0.64, -12], [286, 148, 0.58, 9]],
  [[242, 108, 1.04, 7], [112, 92, 0.86, -8], [86, 158, 0.54, 5]],
  [[122, 98, 0.92, 6], [252, 122, 0.92, -7], [184, 154, 0.52, 0]],
  [[176, 120, 1.12, -3], [274, 62, 0.56, 10], [76, 148, 0.58, -8]],
  [[104, 128, 0.92, -10], [244, 86, 1, 6], [282, 154, 0.52, 0]],
  [[188, 88, 0.92, 2], [96, 140, 0.7, -9], [270, 148, 0.7, 8]],
  [[88, 96, 0.72, -12], [186, 118, 1.02, 0], [286, 82, 0.66, 12]],
  [[146, 118, 1, -4], [262, 82, 0.74, 8], [66, 70, 0.48, 0]],
  [[218, 120, 0.98, 5], [104, 88, 0.84, -7], [78, 158, 0.5, 0]],
  [[180, 104, 1.04, 0], [288, 120, 0.56, -12], [78, 116, 0.56, 8]],
  [[118, 82, 0.78, -8], [224, 126, 1.04, 4], [70, 156, 0.48, 0]],
];

function line(x1, y1, x2, y2, color, width = 5, opacity = 0.9) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>`;
}

function circle(cx, cy, r, fill, opacity = 1) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}"/>`;
}

function rect(x, y, w, h, rx, fill, opacity = 1) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" opacity="${opacity}"/>`;
}

function poly(points, fill, opacity = 1) {
  return `<polygon points="${points}" fill="${fill}" opacity="${opacity}"/>`;
}

function pathD(d, fill = "none", stroke = "none", width = 5, opacity = 1) {
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
}

function dots(points, colors, r = 7) {
  return points.map(([x, y], i) => circle(x, y, r, colors[i % colors.length], 0.95)).join("");
}

function icon(name, colors) {
  const [a, b, c, d] = colors;
  const ink = "#0b1117";
  const paper = "#e8edf3";
  const soft = "#8fa3ba";
  const stroke = (x1, y1, x2, y2, color = a, width = 5, opacity = 0.92) => line(x1, y1, x2, y2, color, width, opacity);

  switch (name) {
    case "neuralNet":
      return `${stroke(-58, 18, -12, -28, a, 7)}${stroke(-12, -28, 42, 0, b, 7)}${stroke(-12, -28, 52, -48, d, 5)}${stroke(42, 0, 70, 38, c, 7)}${stroke(-40, 42, 42, 0, c, 5)}${dots([[-58, 18], [-12, -28], [42, 0], [70, 38], [-40, 42], [52, -48]], [a, b, c, d], 14)}`;
    case "layerStack":
      return `${rect(-70, -46, 34, 92, 13, a, 0.94)}${rect(-18, -62, 36, 124, 13, b, 0.94)}${rect(36, -46, 34, 92, 13, c, 0.94)}${stroke(-36, -22, -18, -22, paper, 3, 0.5)}${stroke(-36, 22, -18, 22, paper, 3, 0.5)}${stroke(18, -38, 36, -38, paper, 3, 0.5)}${stroke(18, 36, 36, 36, paper, 3, 0.5)}${dots([[-53, -22], [-53, 22], [0, -38], [0, 0], [0, 36], [53, -38], [53, 36]], [ink], 5)}`;
    case "rewardMaze":
      return `${pathD("M-72 42h36V8h44v-40h54v48h28", "none", b, 9)}${pathD("M64 -62l9 18 20 3-15 14 4 20-18-10-18 10 4-20-15-14 20-3z", d)}${dots([[-72, 42], [8, -32], [62, 16]], [a, c, b], 10)}`;
    case "foundationBlocks":
      return `${poly("0,-64 58,-32 0,0 -58,-32", b)}${poly("-58,-32 0,0 0,66 -58,34", c, 0.96)}${poly("58,-32 0,0 0,66 58,34", a, 0.96)}${stroke(0, 0, 0, 66, paper, 3, 0.28)}${circle(-74, -48, 7, d)}${circle(76, 40, 8, b)}`;
    case "promptCards":
      return `${rect(-66, -54, 56, 72, 10, paper, 0.92)}${rect(-4, -42, 70, 92, 12, a, 0.9)}${stroke(-52, -30, -26, -30, b, 5)}${stroke(12, -14, 46, -14, paper, 5, 0.7)}${stroke(12, 10, 34, 10, paper, 5, 0.7)}${circle(-50, -6, 7, d)}`;
    case "adaptivePath":
      return `${pathD("M-76 36c32-50 52 24 82-18 19-26 31-45 74-50", "none", a, 8)}${pathD("M-38 -30h68M-18 -30v68M-50 38h68", "none", b, 6)}${dots([[-76, 36], [6, 18], [80, -32], [-18, -30], [-50, 38]], [a, b, c, d], 9)}`;
    case "sliderTiles":
      return `${rect(-74, -42, 148, 84, 18, c, 0.86)}${stroke(-48, -16, 48, -16, paper, 5, 0.45)}${stroke(-48, 16, 48, 16, paper, 5, 0.45)}${circle(-18, -16, 11, a)}${circle(30, 16, 11, b)}${circle(56, -46, 12, d)}`;
    case "phoneChip":
      return `${rect(-40, -70, 80, 140, 18, c, 0.94)}${rect(-25, -48, 50, 88, 8, ink, 0.52)}${rect(-12, -22, 24, 32, 5, a, 0.95)}${[[-32, -6, -14, -6], [14, -6, 32, -6], [-32, 14, -14, 14], [14, 14, 32, 14]].map((p) => stroke(...p, b, 3)).join("")}${circle(0, 54, 5, paper, 0.72)}`;
    case "edgeNodes":
      return `${circle(-54, -20, 22, a, 0.9)}${circle(24, -48, 18, b, 0.9)}${circle(58, 28, 24, c, 0.9)}${circle(-24, 48, 15, d, 0.9)}${stroke(-54, -20, 24, -48, paper, 4, 0.36)}${stroke(24, -48, 58, 28, paper, 4, 0.36)}${stroke(-54, -20, -24, 48, paper, 4, 0.36)}`;
    case "smartphoneLayers":
      return `${rect(-48, -64, 96, 128, 18, a, 0.94)}${rect(-30, -42, 60, 22, 6, paper, 0.35)}${rect(-30, -8, 60, 22, 6, c, 0.76)}${rect(-30, 26, 60, 22, 6, b, 0.76)}${circle(-18, -31, 5, d)}${circle(20, 37, 5, paper, 0.7)}`;
    case "speechParse":
      return `${pathD("M-70-14c0-22 18-40 40-40h72c22 0 40 18 40 40s-18 40-40 40H4l-42 30 10-30h-2c-22 0-40-18-40-40z", a)}${circle(-34, -14, 6, ink, 0.58)}${circle(0, -14, 6, ink, 0.58)}${circle(34, -14, 6, ink, 0.58)}${pathD("M-46 54h92M-20 54v34M20 54v34", "none", b, 5)}`;
    case "cameraLens":
      return `${rect(-72, -38, 144, 84, 20, c, 0.95)}${poly("-38,-38 -18,-62 26,-62 46,-38", b, 0.92)}${circle(0, 4, 34, ink, 0.7)}${circle(0, 4, 18, a, 0.94)}${circle(12, -8, 5, paper, 0.86)}`;
    case "medicalWords":
      return `${rect(-64, -58, 92, 120, 14, paper, 0.9)}${pathD("M-42-8h20l10-26 18 50 11-24h28", "none", d, 7)}${rect(38, -46, 38, 38, 9, a)}${pathD("M57-38v22M46-27h22", "none", paper, 5)}${stroke(-42, 32, 6, 32, b, 5)}`;
    case "dnaText":
      return `${pathD("M-54-58c66 26 66 90 0 116M54-58c-66 26-66 90 0 116", "none", a, 6)}${[-34, -10, 16, 48].map((y) => stroke(-38, y, 38, y - 16, b, 4)).join("")}${rect(-72, 50, 56, 18, 6, d, 0.9)}${rect(16, -66, 58, 18, 6, c, 0.9)}`;
    case "syntaxTree":
      return `${stroke(0, -62, -52, -8, a, 5)}${stroke(0, -62, 52, -8, a, 5)}${stroke(-52, -8, -74, 48, b, 5)}${stroke(-52, -8, -28, 48, b, 5)}${stroke(52, -8, 28, 48, c, 5)}${stroke(52, -8, 74, 48, c, 5)}${dots([[0, -62], [-52, -8], [52, -8], [-74, 48], [-28, 48], [28, 48], [74, 48]], [a, b, c, d], 10)}`;
    case "plainDocument":
      return `${rect(-60, -62, 120, 124, 12, paper, 0.92)}${stroke(-36, -26, 36, -26, a, 6)}${stroke(-36, 0, 20, 0, b, 6)}${stroke(-36, 26, 42, 26, c, 6)}${pathD("M52-54l28 28-28 28", "none", d, 9)}${circle(-44, 48, 8, a)}`;
    case "sparkChip":
      return `${rect(-48, -42, 96, 84, 16, c, 0.92)}${rect(-22, -18, 44, 36, 8, a, 0.94)}${[-60, -28, 0, 28, 60].map((x) => stroke(x, -56, x, -42, b, 4) + stroke(x, 42, x, 56, b, 4)).join("")}${pathD("M62-66l8 18 19 8-19 8-8 18-8-18-19-8 19-8z", d)}`;
    case "barDashboard":
      return `${rect(-72, -56, 144, 112, 14, c, 0.84)}${rect(-48, 6, 18, 34, 5, a)}${rect(-12, -24, 18, 64, 5, b)}${rect(24, -42, 18, 82, 5, d)}${pathD("M-52-28c30 28 58-18 96 2", "none", paper, 4, 0.55)}`;
    case "scatterDots":
      return `${stroke(-64, 48, 64, 48, soft, 3, 0.5)}${stroke(-64, 48, -64, -48, soft, 3, 0.5)}${dots([[-40, 18], [-20, -14], [8, 6], [24, -32], [46, -10], [54, 26]], [a, b, c, d], 8)}${pathD("M-44 26c28-36 60-24 94-62", "none", paper, 4, 0.5)}`;
    case "optimizerPath":
      return `${pathD("M-76 50c14-70 50-18 62-70 11 42 44 34 48-12 12 52 30 42 56-6", "none", d, 8)}${circle(70, -38, 12, a)}${pathD("M74-54l6 13 14 2-10 10 2 14-12-7-13 7 3-14-10-10 14-2z", b)}`;
    case "gearGauge":
      return `${circle(-28, 2, 42, c, 0.9)}${circle(-28, 2, 20, ink, 0.5)}${[0, 45, 90, 135, 180, 225, 270, 315].map((r) => `<rect x="-34" y="-57" width="12" height="22" rx="4" fill="${a}" transform="rotate(${r} -28 2)"/>`).join("")}${pathD("M36 40a58 58 0 0 1 38-90", "none", b, 8)}${stroke(36, 40, 68, -18, d, 6)}`;
    case "moleculeDock":
      return `${stroke(-56, -32, 0, 2, a, 7)}${stroke(0, 2, 62, -28, b, 7)}${stroke(0, 2, 34, 58, c, 7)}${stroke(0, 2, -54, 52, d, 7)}${dots([[-56, -32], [0, 2], [62, -28], [34, 58], [-54, 52]], [a, b, c, d], 18)}${pathD("M-20-62h40l16 20-16 20h-40l-16-20z", "none", paper, 4, 0.45)}`;
    case "flask":
      return `${pathD("M-22-64h44M-10-64v40l-46 74c-8 13 1 28 16 28h80c15 0 24-15 16-28L10-24v-40", paper, a, 5, 0.9)}${pathD("M-32 38c20-15 44 14 72-2", "none", b, 7)}${circle(-10, 18, 7, d)}${circle(26, 50, 5, c)}`;
    case "knowledgeGraph":
      return `${stroke(-66, -26, -8, -54, a, 5)}${stroke(-8, -54, 48, -10, b, 5)}${stroke(48, -10, 68, 52, c, 5)}${stroke(48, -10, -30, 38, d, 5)}${stroke(-66, -26, -30, 38, a, 5)}${dots([[-66, -26], [-8, -54], [48, -10], [68, 52], [-30, 38]], [a, b, c, d], 16)}${rect(-16, -8, 34, 18, 6, paper, 0.35)}`;
    case "fpgaGrid":
      return `${rect(-66, -58, 132, 116, 12, c, 0.9)}${[-42, -14, 14, 42].map((x) => stroke(x, -58, x, 58, paper, 3, 0.28)).join("")}${[-34, -8, 18, 44].map((y) => stroke(-66, y, 66, y, paper, 3, 0.28)).join("")}${[-42, -14, 14, 42].flatMap((x, i) => [-34, -8, 18, 44].map((y, j) => circle(x, y, (i + j) % 3 === 0 ? 7 : 4, [a, b, d][(i + j) % 3], 0.9))).join("")}`;
    case "embeddedBoard":
      return `${rect(-72, -50, 144, 100, 13, c, 0.9)}${rect(-34, -22, 54, 44, 7, a)}${circle(48, -24, 12, b)}${circle(48, 24, 12, d)}${stroke(20, -12, 48, -24, paper, 3, 0.45)}${stroke(20, 12, 48, 24, paper, 3, 0.45)}${[-58, -34, -10, 14, 38, 62].map((x) => circle(x, 42, 4, paper, 0.5)).join("")}`;
    case "wafer":
      return `${circle(0, 0, 58, a, 0.88)}${circle(0, 0, 38, ink, 0.18)}${[-36, -12, 12, 36].map((x) => stroke(x, -50, x, 50, paper, 2, 0.4)).join("")}${[-36, -12, 12, 36].map((y) => stroke(-50, y, 50, y, paper, 2, 0.4)).join("")}${pathD("M36 42c18-18 24-42 16-66", "none", b, 7)}`;
    case "waveform":
      return `${pathD("M-78 10c18-72 38 72 56 0s38-72 56 0 38 72 56 0", "none", a, 9)}${pathD("M-66 48c34-22 62-22 96 0 22 14 44 14 70 0", "none", b, 6)}${circle(-68, -48, 7, d)}${circle(70, -38, 10, c)}`;
    case "edgeCloud":
      return `${pathD("M-54 30c-18 0-32-13-32-30 0-16 12-29 28-31 8-18 27-30 49-30 30 0 54 21 58 49 20 1 35 15 35 33 0 19-17 33-38 33h-100z", a)}${circle(-22, 0, 9, b)}${circle(22, 0, 9, c)}${circle(54, 26, 7, d)}${stroke(-22, 0, 22, 0, paper, 3, 0.36)}${stroke(22, 0, 54, 26, paper, 3, 0.36)}`;
    case "prism":
      return `${poly("-50,50 0,-56 64,50", c, 0.82)}${pathD("M-80-30h82l78 58", "none", paper, 4, 0.6)}${pathD("M2-30l68-28M2-20l82-2M2-10l72 28", "none", a, 5)}${pathD("M2 0l58 58", "none", d, 5)}`;
    case "feedbackLoop":
      return `${pathD("M-48-30c28-38 90-22 100 22", "none", a, 7)}${pathD("M52-8l18-2-12 14", "none", a, 7)}${pathD("M48 34c-30 35-91 17-98-28", "none", b, 7)}${pathD("M-50 6l-18 2 12-14", "none", b, 7)}${rect(-30, -24, 60, 48, 10, c, 0.92)}${circle(0, 0, 10, d)}`;
    case "robotArm":
      return `${rect(-58, 38, 116, 18, 7, c)}${circle(-38, 24, 20, a)}${rect(-28, -26, 72, 20, 8, b, 0.96)}${circle(50, -16, 18, d)}${pathD("M62-24l28-20M62-8l28 20", "none", paper, 6, 0.85)}${circle(-38, 24, 8, ink, 0.55)}`;
    case "bridgeTruss":
      return `${stroke(-78, 46, 78, 46, a, 8)}${stroke(-60, 46, -20, -28, b, 5)}${stroke(-20, -28, 20, 46, b, 5)}${stroke(20, 46, 60, -28, b, 5)}${stroke(-60, 46, 60, -28, c, 4, 0.75)}${stroke(-78, 66, 78, 66, paper, 4, 0.35)}`;
    case "soilCore":
      return `${rect(-56, -62, 112, 124, 16, c, 0.9)}${pathD("M-54-26c34 14 70-16 108 0", "none", a, 8)}${pathD("M-54 12c34 14 70-16 108 0", "none", b, 8)}${pathD("M-54 48c34 14 70-16 108 0", "none", d, 8)}${circle(-16, -42, 6, paper, 0.5)}${circle(32, 28, 8, ink, 0.25)}`;
    case "printerNozzle":
      return `${rect(-48, -66, 96, 26, 7, c)}${pathD("M-20-40h40l-10 42h-20z", b)}${stroke(0, 2, 0, 44, a, 6)}${pathD("M-62 56h124M-46 36h92M-28 18h56", "none", d, 7)}`;
    case "rocketPlane":
      return `${pathD("M-80 24L76-44 42 10 80 36 18 36-8 66z", a)}${pathD("M-10 2l-46-18 20 32", b)}${circle(18, -12, 8, paper, 0.75)}${pathD("M-66 50c30 18 70 14 108 0", "none", d, 6)}`;
    case "oceanBuoy":
      return `${pathD("M-82 42c34-20 58 20 92 0s58-20 92 0", "none", b, 8)}${pathD("M-72 66c34-20 58 20 92 0s58-20 92 0", "none", a, 7)}${pathD("M-18 28l18-72 18 72z", d)}${rect(-30, 28, 60, 26, 8, c)}${circle(0, -18, 9, paper, 0.72)}`;
    case "drone":
      return `${rect(-26, -20, 52, 40, 10, c)}${stroke(-26, -10, -70, -42, a, 5)}${stroke(26, -10, 70, -42, b, 5)}${stroke(-26, 10, -70, 42, d, 5)}${stroke(26, 10, 70, 42, a, 5)}${[[-76, -46], [76, -46], [-76, 46], [76, 46]].map(([x, y], i) => circle(x, y, 18, [a, b, d, c][i], 0.72) + circle(x, y, 6, paper, 0.75)).join("")}`;
    case "autonomyRoad":
      return `${pathD("M-72 62c22-68 62-108 142-122", "none", c, 34, 0.74)}${pathD("M-72 62c22-68 62-108 142-122", "none", paper, 4, 0.55)}${rect(-34, 8, 60, 30, 9, a)}${circle(-18, 40, 7, ink, 0.55)}${circle(10, 40, 7, ink, 0.55)}${circle(72, -58, 11, d)}`;
    case "powerGrid":
      return `${pathD("M-70 54h140M-46 54l20-96 20 96M26 54l20-96 20 96", "none", a, 7)}${stroke(-46, -14, 46, -14, b, 5)}${stroke(-60, 20, 60, 20, d, 5)}${circle(-70, 54, 7, b)}${circle(70, 54, 7, c)}`;
    case "windSolar":
      return `${rect(-80, 24, 54, 38, 6, c)}${[[-80, 24], [-62, 24], [-44, 24], [-26, 24]].map(([x, y]) => stroke(x, y, x + 54, y + 38, paper, 2, 0.35)).join("")}${stroke(42, 62, 42, -28, a, 6)}${pathD("M42-28l-48-18M42-28l44-26M42-28l6 52", "none", b, 8)}`;
    case "reactorCore":
      return `${circle(0, 0, 54, c, 0.9)}${circle(0, 0, 28, a, 0.95)}${pathD("M0-58c30 34 30 82 0 116M-58 0c34-30 82-30 116 0", "none", b, 5, 0.8)}${pathD("M-36-36l72 72M36-36l-72 72", "none", d, 4, 0.72)}`;
    case "batteryGrid":
      return `${rect(-66, -42, 110, 84, 14, c)}${rect(44, -18, 18, 36, 5, c)}${pathD("M-38 0h24l-8 26 34-42H-8l8-22z", b)}${stroke(-78, 62, 72, 62, a, 6)}${dots([[-78, 62], [-10, 62], [72, 62]], [a, b, d], 7)}`;
    case "cloudServer":
      return `${pathD("M-58-4c-17 0-30-12-30-28 0-14 11-26 26-29 8-17 26-28 48-28 29 0 52 21 56 48 20 1 36 15 36 33 0 19-17 33-39 33h-97z", a, "none", 0, 0.88)}${rect(-62, 28, 124, 44, 10, c)}${stroke(-42, 50, 16, 50, paper, 4, 0.5)}${circle(40, 50, 6, b)}`;
    case "clusterStack":
      return `${[-48, -16, 16, 48].map((y, i) => rect(-68, y - 11, 136, 22, 6, [a, c, b, d][i], 0.88) + circle(48, y, 4, paper, 0.7)).join("")}${pathD("M-78-66h156v132", "none", paper, 3, 0.22)}`;
    case "ledgerBlocks":
      return `${rect(-72, -44, 52, 42, 8, a)}${rect(-18, -16, 52, 42, 8, b)}${rect(36, 12, 52, 42, 8, c)}${stroke(-20, -24, -18, -16, paper, 5, 0.45)}${stroke(34, 4, 36, 12, paper, 5, 0.45)}${pathD("M-54-24h16M0 4h16M54 32h16", "none", paper, 3, 0.55)}`;
    case "realTimeClock":
      return `${circle(0, 0, 58, c, 0.9)}${circle(0, 0, 42, ink, 0.3)}${stroke(0, 0, 0, -28, a, 6)}${stroke(0, 0, 28, 16, b, 6)}${pathD("M-76 52h152", "none", d, 7)}${dots([[-76, 52], [-26, 52], [26, 52], [76, 52]], [a, b, c, d], 6)}`;
    case "mesh":
      return `${dots([[-66, -34], [-8, -54], [54, -26], [70, 40], [-26, 50], [-74, 22]], [a, b, c, d], 12)}${[[-66, -34, -8, -54], [-8, -54, 54, -26], [54, -26, 70, 40], [70, 40, -26, 50], [-26, 50, -74, 22], [-74, 22, -66, -34], [-8, -54, -26, 50], [54, -26, -74, 22]].map((p) => stroke(...p, paper, 3, 0.38)).join("")}`;
    case "shieldLock":
      return `${pathD("M0-66l68 26v42c0 38-25 64-68 78-43-14-68-40-68-78v-42z", c, a, 5)}${rect(-24, -4, 48, 42, 8, b)}${pathD("M-14-4v-14c0-20 28-20 28 0v14", "none", paper, 5)}${circle(0, 18, 5, ink, 0.55)}`;
    case "privacyWindow":
      return `${rect(-68, -52, 136, 104, 14, c)}${rect(-44, -24, 88, 48, 9, ink, 0.34)}${circle(-22, 0, 13, a)}${rect(2, -13, 26, 26, 7, b)}${pathD("M-52 42c24-24 80-24 104 0", "none", d, 7)}`;
    case "keyPair":
      return `${circle(-36, -18, 24, a, 0.9)}${circle(-36, -18, 10, ink, 0.45)}${stroke(-12, -18, 62, -18, a, 10)}${stroke(38, -18, 38, 4, a, 8)}${circle(20, 40, 24, b, 0.88)}${stroke(44, 40, 78, 40, b, 10)}${stroke(60, 40, 60, 58, b, 7)}`;
    case "lawBook":
      return `${rect(-66, -46, 132, 92, 10, c)}${pathD("M0-46v92", "none", paper, 3, 0.35)}${pathD("M-38-4h76M-24-4c0-20 48-20 48 0", "none", b, 5)}${circle(-24, 8, 10, a)}${circle(24, 8, 10, d)}${stroke(-40, 46, 40, 46, a, 5)}`;
    case "simulationGrid":
      return `${rect(-72, -54, 144, 108, 12, c, 0.8)}${[-48, -24, 0, 24, 48].map((x) => stroke(x, -54, x, 54, paper, 2, 0.22)).join("")}${[-36, -12, 12, 36].map((y) => stroke(-72, y, 72, y, paper, 2, 0.22)).join("")}${pathD("M-58 36c42-80 76 52 128-44", "none", b, 7)}${circle(42, -18, 13, a)}`;
    case "telemetryDish":
      return `${pathD("M-50 44c50-8 78-36 92-84", "none", a, 10)}${pathD("M-52 46l30 20M-30 40l26 28", "none", c, 7)}${pathD("M14-36c28 10 42 28 48 54M34-58c44 17 66 46 76 86", "none", b, 5)}${circle(-50, 44, 9, d)}`;
    case "twinMirrors":
      return `${rect(-72, -46, 56, 92, 12, a, 0.88)}${rect(16, -46, 56, 92, 12, c, 0.88)}${pathD("M-16-18h32M-16 18h32", "none", paper, 5, 0.42)}${pathD("M-48-10l18 20-18 20M48-10l-18 20 18 20", "none", b, 6)}`;
    case "iotHub":
      return `${circle(0, 0, 28, a, 0.9)}${rect(-76, -56, 36, 26, 8, b)}${rect(42, -48, 44, 34, 8, c)}${rect(-82, 26, 42, 32, 8, d)}${rect(42, 30, 40, 28, 8, b)}${[[-40, -43, 0, 0], [42, -31, 0, 0], [-40, 42, 0, 0], [42, 44, 0, 0]].map((p) => stroke(...p, paper, 4, 0.36)).join("")}`;
    case "genome":
      return `${[-58, -30, -2, 26, 54].map((x, i) => rect(x, -58 + (i % 2) * 18, 18, 112 - (i % 2) * 18, 8, [a, b, c, d][i % 4], 0.92)).join("")}${pathD("M-72 62c36-22 92-22 144 0", "none", paper, 4, 0.35)}`;
    case "proteinFold":
      return `${pathD("M-70-16c22-52 54 16 76-24s48-12 38 22 42 22 30 62-66 14-84 0-64 18-60-60z", "none", a, 9)}${dots([[-70, -16], [6, -40], [44, -18], [74, 44], [-10, 44]], [a, b, c, d], 9)}`;
    case "cellFactory":
      return `${circle(-38, -8, 40, c, 0.9)}${circle(-38, -8, 14, a)}${rect(12, -42, 74, 84, 18, b, 0.82)}${pathD("M28-14h42M28 14h30M-12 42c28 30 64 26 92 2", "none", d, 6)}`;
    case "cellCluster":
      return `${dots([[-46, -26], [2, -46], [50, -12], [34, 40], [-26, 34], [-68, 18]], [a, b, c, d], 25)}${dots([[-46, -26], [2, -46], [50, -12], [34, 40], [-26, 34], [-68, 18]], [ink], 7)}`;
    case "marineScope":
      return `${pathD("M-78 34c28-24 62-24 92 0s58 24 92 0", "none", b, 8)}${pathD("M-36-30c32-26 78-18 112 16-34 34-80 40-112 16l-26 18 12-34z", a)}${circle(48, -12, 5, ink, 0.6)}${pathD("M-58 58h116", "none", c, 7)}`;
    case "maskGauge":
      return `${pathD("M-62-18c0-34 124-34 124 0v34c0 26-24 48-62 48s-62-22-62-48z", c)}${circle(-24, -6, 10, a)}${circle(24, -6, 10, b)}${pathD("M-24 30c14 10 34 10 48 0", "none", paper, 5, 0.7)}${pathD("M54-24c24-6 40 14 30 36", "none", d, 6)}`;
    case "tooth":
      return `${pathD("M-44-50c16-18 32-2 44-2s28-16 44 2c20 22-2 112-28 112-15 0-6-42-16-42S-1 62-16 62c-26 0-48-90-28-112z", paper, a, 5)}${pathD("M-20-12h40M0-32v40", "none", b, 7)}${circle(44, 36, 8, d)}`;
    case "brainScan":
      return `${pathD("M-54 6c-26-42 7-86 48-68 30-26 84 1 72 44 28 12 22 64-14 68-20 30-68 20-76-12-16 0-25-12-30-32z", c, a, 5)}${pathD("M-34-8c26-28 50 12 76-16M-20 28c24-22 54-10 74 10M-2-52c-2 38 20 54 50 62", "none", b, 5)}${circle(-42, 18, 7, d)}`;
    case "careLamp":
      return `${pathD("M-48-36h96l-22 48h-52z", a)}${stroke(0, 12, 0, 66, b, 7)}${pathD("M-46 66h92", "none", c, 9)}${pathD("M-72 4c24 30 120 30 144 0", "none", d, 6)}${circle(0, -10, 10, paper, 0.62)}`;
    case "antibody":
      return `${pathD("M0 58V0M0 0l-48-48M0 0l48-48", "none", a, 12)}${pathD("M-48-48l-18-20M48-48l18-20", "none", b, 9)}${dots([[0, 58], [-66, -68], [66, -68], [-24, 24], [24, 24]], [a, b, c, d], 10)}`;
    case "vetScope":
      return `${pathD("M-28-50c0 36-32 36-32 72 0 26 24 44 60 44s60-18 60-44c0-36-32-36-32-72", "none", a, 8)}${circle(-42, -54, 12, b)}${circle(42, -54, 12, b)}${pathD("M-18 20c10 12 26 12 36 0M-34 0h68", "none", paper, 5, 0.6)}${dots([[-34, 44], [-12, 28], [12, 28], [34, 44]], [c, d], 8)}`;
    case "scanSlices":
      return `${[-46, -22, 2, 26, 50].map((x, i) => `<ellipse cx="${x}" cy="0" rx="24" ry="56" fill="none" stroke="${[a, b, c, d][i % 4]}" stroke-width="6" opacity="0.9"/>`).join("")}${pathD("M-68 58h136", "none", paper, 4, 0.35)}`;
    case "tissueScaffold":
      return `${[-54, -18, 18, 54].map((x) => stroke(x, -58, x, 58, a, 4, 0.55)).join("")}${[-44, -8, 28, 56].map((y) => stroke(-70, y, 70, y, b, 4, 0.55)).join("")}${pathD("M-58 42c38-80 70 34 128-58", "none", d, 8)}${dots([[-58, 42], [12, 6], [70, -16]], [c, d, a], 9)}`;
    case "neuroChip":
      return `${rect(-44, -38, 88, 76, 14, c)}${pathD("M-18 0c22-40 50-24 50 4 0 24-28 28-50-4z", "none", a, 6)}${[-66, -38, -10, 18, 66].map((x) => stroke(x, -58, x, -38, b, 4) + stroke(x, 38, x, 58, b, 4)).join("")}${pathD("M44 0h44M88 0l-14-12M88 0L74 12", "none", d, 6)}`;
    case "prostheticJoint":
      return `${circle(-28, -24, 24, a)}${circle(28, 24, 24, b)}${rect(-8, -8, 16, 16, 5, paper, 0.7)}${stroke(-10, -10, 12, 12, c, 14)}${pathD("M-50-46l-24-28M50 46l24 28", "none", d, 9)}`;
    case "emgPulse":
      return `${pathD("M-82 20h34l16-52 28 102 22-70h22l12-28 18 48h32", "none", d, 9)}${rect(-58, -60, 116, 32, 8, c, 0.75)}${circle(-40, -44, 6, a)}${circle(0, -44, 6, b)}${circle(40, -44, 6, a)}`;
    case "pillGene":
      return `${g("pill", -34, 2, 1, -24, colors)}${pathD("M26-60c36 22 36 98 0 120M76-60c-36 22-36 98 0 120", "none", a, 5)}${[-36, 0, 36].map((y) => stroke(34, y, 70, y - 14, b, 4)).join("")}`;
    case "heartMonitor":
      return `${rect(-70, -52, 140, 104, 14, c, 0.84)}${pathD("M-52 4h24l12-30 26 66 16-36h28", "none", d, 8)}${circle(46, -32, 10, a)}${stroke(-42, 38, 42, 38, b, 5)}`;
    case "ruralMap":
      return `${pathD("M-72 48l40-78 46 34 58-46v106l-58 30-46-34z", c, a, 4)}${pathD("M-30-20c26 12 44 42 44 80M14 4c20 0 42-22 58-46", "none", paper, 4, 0.36)}${circle(-30, -20, 10, b)}${circle(46, -22, 10, d)}`;
    case "homeHeart":
      return `${pathD("M-62-2L0-58 62-2v64h-124z", c, a, 5)}${pathD("M0 34c-34-20-30-54-8-54 11 0 8 8 8 8s-3-8 8-8c22 0 26 34-8 54z", d)}${rect(-18, 18, 36, 44, 7, b, 0.74)}`;
    case "climateMap":
      return `${rect(-70, -52, 140, 104, 14, c, 0.82)}${pathD("M-54 22c32-54 70 14 108-44", "none", d, 8)}${pathD("M-54-20h108M-54 14h108", "none", paper, 3, 0.25)}${circle(-42, -20, 8, a)}${circle(52, -22, 10, b)}`;
    case "airParticles":
      return `${pathD("M-80-30c42-22 76 20 118 0M-62 8c38-18 64 18 102 0M-84 46c48-24 90 24 138 0", "none", a, 7)}${dots([[-38, -42], [22, -22], [62, 2], [-20, 24], [38, 54]], [b, c, d], 8)}`;
    case "recyclingLoop":
      return `${pathD("M-34-50c28-18 74-6 90 26M56-24l-2-24 20 14M48 48c-28 22-76 12-94-14M-46 34l4 24-22-12M-48 28c-8-34 12-68 48-78", "none", a, 8)}${circle(0, 0, 20, b, 0.85)}`;
    case "carbonCoins":
      return `${circle(-40, 22, 32, b)}${circle(0, 0, 34, a)}${circle(42, -22, 30, d)}${pathD("M-12-4c12-12 30-8 40 4M-12 12c12 10 32 12 48 0", "none", ink, 5, 0.45)}${pathD("M-66-42h28M-52-56v28", "none", c, 6)}`;
    case "financeGraph":
      return `${rect(-72, -48, 144, 96, 13, c, 0.84)}${pathD("M-52 26l32-28 26 18 42-50", "none", b, 8)}${pathD("M30-34h22v22", "none", b, 7)}${rect(-50, 14, 16, 24, 4, a)}${rect(-18, 2, 16, 36, 4, d)}${rect(14, -14, 16, 52, 4, a)}`;
    case "fieldRows":
      return `${pathD("M-76 60c30-54 56-84 76-114M-38 64c22-50 44-78 64-110M0 66c15-46 34-74 62-102M38 64c10-34 26-58 48-78", "none", b, 7)}${pathD("M-80 66h160", "none", c, 10)}${circle(-44, -20, 8, a)}${circle(30, -30, 8, d)}`;
    case "cropLeaf":
      return `${pathD("M-60 44c10-76 80-100 126-86-4 74-66 108-126 86z", a)}${pathD("M-46 34c34-26 70-44 104-66", "none", ink, 5, 0.36)}${pathD("M-10 54v-70", "none", b, 7)}${circle(56, -44, 9, d)}`;
    case "fieldRobot":
      return `${rect(-42, -20, 84, 48, 12, c)}${circle(-24, 36, 12, ink, 0.55)}${circle(24, 36, 12, ink, 0.55)}${pathD("M-66 54h132M-58 72h116", "none", b, 7)}${pathD("M0-20v-30M0-50l34-18", "none", a, 7)}${circle(38, -70, 9, d)}`;
    case "ecologyWeb":
      return `${dots([[-62, -12], [-22, -52], [38, -36], [62, 22], [4, 52], [-56, 42]], [a, b, c, d], 13)}${[[-62, -12, -22, -52], [-22, -52, 38, -36], [38, -36, 62, 22], [62, 22, 4, 52], [4, 52, -56, 42], [-56, 42, -62, -12], [-62, -12, 38, -36], [-22, -52, 4, 52]].map((p) => stroke(...p, paper, 3, 0.32)).join("")}${pathD("M-20 0c18-28 44-20 48 6-20 18-40 16-48-6z", b)}`;
    case "saplings":
      return `${[-48, 0, 48].map((x, i) => `${stroke(x, 54, x, -18 - i * 8, b, 6)}${pathD(`M${x}-10c-28-16-30-38 0-46 8 26 8 38 0 46z`, a)}${pathD(`M${x}-6c28-16 30-38 0-46-8 26-8 38 0 46z`, c)}`).join("")}${stroke(-82, 62, 82, 62, d, 8)}`;
    case "satelliteScan":
      return `${rect(-26, -22, 52, 44, 8, c)}${pathD("M-26-16l-50-30M26 16l50 30", "none", a, 8)}${pathD("M-74-54l-22 34M74 54l22-34", "none", b, 7)}${pathD("M-44 56c28-30 60-42 102-40", "none", d, 5)}${circle(60, 16, 8, paper, 0.68)}`;
    case "volcano":
      return `${pathD("M-76 62l52-116 24 50 24-50 52 116z", c, a, 5)}${pathD("M-16-54c-8-22 16-34 8-56M18-54c22-20 0-46 26-64", "none", d, 7)}${pathD("M-18-4c18 20 42 20 60 0", "none", b, 8)}`;
    case "toxinVial":
      return `${pathD("M-22-64h44M-12-64v36l-38 72c-7 13 2 26 16 26h68c14 0 23-13 16-26L12-28v-36", paper, a, 5, 0.9)}${pathD("M-34 22c20-13 46 12 68-2", "none", d, 8)}${circle(-8, 40, 6, b)}${pathD("M42-46l24-22M66-46L42-68", "none", c, 6)}`;
    case "waterDrop":
      return `${pathD("M0-70c36 46 58 78 58 104 0 34-26 58-58 58s-58-24-58-58c0-26 22-58 58-104z", a)}${pathD("M-28 38c22 18 52 16 70-10", "none", paper, 6, 0.55)}${circle(22, -6, 9, paper, 0.5)}`;
    case "sensorTripod":
      return `${rect(-28, -58, 56, 44, 12, c)}${circle(0, -36, 13, a)}${stroke(0, -14, 0, 28, b, 7)}${stroke(0, 28, -46, 66, d, 6)}${stroke(0, 28, 46, 66, d, 6)}${pathD("M-74-20c24-20 52-20 74 0M0-20c24-20 52-20 74 0", "none", a, 5, 0.55)}`;
    case "atom":
      return `<ellipse cx="0" cy="0" rx="78" ry="24" fill="none" stroke="${a}" stroke-width="6" transform="rotate(24)"/><ellipse cx="0" cy="0" rx="78" ry="24" fill="none" stroke="${b}" stroke-width="6" transform="rotate(-24)"/><ellipse cx="0" cy="0" rx="26" ry="74" fill="none" stroke="${c}" stroke-width="6"/>${circle(0, 0, 15, d)}${circle(60, -34, 8, a)}`;
    case "plasma":
      return `${pathD("M-72 44c20-92 50 18 72-68 22 86 52-24 72 68", "none", d, 9)}${pathD("M-54-10c36 38 72 38 108 0", "none", a, 7)}${circle(-64, 42, 10, b)}${circle(64, 42, 10, c)}`;
    case "starMap":
      return `${dots([[-68, -36], [-20, -54], [18, -8], [64, -34], [46, 38], [-34, 42]], [a, b, c, d], 6)}${[[-68, -36, -20, -54], [-20, -54, 18, -8], [18, -8, 64, -34], [18, -8, 46, 38], [46, 38, -34, 42], [-34, 42, -68, -36]].map((p) => stroke(...p, paper, 3, 0.38)).join("")}${pathD("M-2-70l8 18 18 8-18 8-8 18-8-18-18-8 18-8z", d)}`;
    case "quantumGates":
      return `${[-54, 0, 54].map((x, i) => `${rect(x - 24, -24, 48, 48, 9, [a, b, c][i])}${stroke(x - 24, 0, x - 46, 0, paper, 4, 0.5)}${stroke(x + 24, 0, x + 46, 0, paper, 4, 0.5)}`).join("")}${circle(-54, 0, 7, ink, 0.45)}${pathD("M-12-8L12 8M12-8L-12 8", "none", ink, 5, 0.45)}${circle(54, 0, 13, ink, 0.25)}${pathD("M-78-50c42 20 114 20 156 0", "none", d, 5)}`;
    case "quantumChip":
      return `${rect(-52, -42, 104, 84, 13, c)}${pathD("M-24 0h48M0-24v48M-24-24l48 48M24-24l-48 48", "none", a, 5)}${[-72, -36, 0, 36, 72].map((x) => stroke(x, -58, x, -42, b, 4) + stroke(x, 42, x, 58, b, 4)).join("")}${circle(0, 0, 9, d)}`;
    case "lattice":
      return `${[-56, 0, 56].map((x) => [-34, 24].map((y) => circle(x, y, 12, [a, b, c][Math.abs(x + y) % 3], 0.9)).join("")).join("")}${[[-56, -34, 0, -34], [0, -34, 56, -34], [-56, 24, 0, 24], [0, 24, 56, 24], [-56, -34, -56, 24], [0, -34, 0, 24], [56, -34, 56, 24], [-56, -34, 0, 24], [0, -34, 56, 24]].map((p) => stroke(...p, paper, 3, 0.34)).join("")}`;
    case "nanotubes":
      return `${[-54, -18, 18, 54].map((x) => pathD(`M${x}-58c24 36 24 80 0 116`, "none", a, 5)).join("")}${[-36, 0, 36].map((x) => pathD(`M${x}-58c-24 36-24 80 0 116`, "none", b, 5)).join("")}${circle(-54, -58, 7, d)}${circle(54, 58, 7, c)}`;
    case "wearableBand":
      return `${pathD("M-62-34c24-28 100-28 124 0v68c-24 28-100 28-124 0z", c, a, 5)}${rect(-34, -28, 68, 56, 12, ink, 0.35)}${pathD("M-18 4h12l8-22 16 42 8-20h16", "none", d, 5)}${circle(44, -42, 8, b)}`;
    case "lidarFan":
      return `${rect(-22, 26, 44, 28, 8, c)}${circle(0, 22, 10, a)}${[-64, -36, -12, 12, 36, 64].map((x) => pathD(`M0 22L${x}-62`, "none", b, 4, 0.5)).join("")}${pathD("M-76-54c46-24 106-24 152 0", "none", d, 5)}`;
    case "hapticPads":
      return `${rect(-70, -32, 48, 64, 12, a)}${rect(-14, -44, 48, 88, 12, c)}${rect(42, -32, 48, 64, 12, b)}${[-52, 10, 66].map((x) => pathD(`M${x}-62c16 18 16 34 0 52M${x}62c16-18 16-34 0-52`, "none", d, 4, 0.65)).join("")}`;
    case "vrHeadset":
      return `${rect(-78, -34, 156, 68, 24, c)}${rect(-56, -18, 46, 36, 12, ink, 0.35)}${rect(10, -18, 46, 36, 12, ink, 0.35)}${pathD("M-78 0c-24 0-34 18-34 38M78 0c24 0 34 18 34 38", "none", a, 7)}${circle(0, 46, 9, d)}`;
    case "arFrame":
      return `${pathD("M-70-42h52M18-42h52M-70 42h52M18 42h52", "none", a, 8)}${pathD("M-70-42v52M70-42v52M-70-10v52M70-10v52", "none", a, 8)}${poly("0,-34 38,-12 0,10 -38,-12", b)}${poly("-38,-12 0,10 0,54 -38,32", c)}${poly("38,-12 0,10 0,54 38,32", d)}`;
    case "colorWheel":
      return `${circle(0, 0, 62, a)}${pathD("M0 0L0-62A62 62 0 0 1 54 31z", b)}${pathD("M0 0L54 31A62 62 0 0 1 -54 31z", c)}${pathD("M0 0L-54 31A62 62 0 0 1 0-62z", d)}${circle(0, 0, 24, ink, 0.34)}${circle(0, 0, 12, paper, 0.62)}`;
    case "voiceWaves":
      return `${rect(-62, -18, 36, 62, 18, a)}${pathD("M-44 44v22M-70 66h52", "none", a, 7)}${pathD("M-4-34c18 22 18 56 0 78M24-52c30 38 30 92 0 130M52-64c42 52 42 116 0 168", "none", b, 7)}${circle(-44, 8, 6, paper, 0.55)}`;
    case "choiceGraph":
      return `${pathD("M-66 34c28-58 58 46 88-12 18-34 34-30 52-2", "none", a, 8)}${stroke(-64, 58, 76, 58, soft, 3, 0.5)}${stroke(-64, 58, -64, -48, soft, 3, 0.5)}${dots([[-66, 34], [-8, 22], [22, -22], [74, 20]], [a, b, c, d], 9)}`;
    case "ledgerMagnify":
      return `${rect(-76, -50, 100, 100, 12, c)}${stroke(-56, -24, -6, -24, paper, 4, 0.55)}${stroke(-56, 0, 0, 0, paper, 4, 0.55)}${stroke(-56, 24, -18, 24, paper, 4, 0.55)}${circle(34, 8, 32, "none", 1).replace('fill="none"', `fill="none" stroke="${a}" stroke-width="8"`)}${stroke(58, 32, 86, 60, a, 8)}`;
    case "bookSpark":
      return `${pathD("M-72-46c34-16 60-6 72 12 12-18 38-28 72-12v104c-34-16-60-6-72 12-12-18-38-28-72-12z", c, a, 5)}${pathD("M0-34v104", "none", paper, 3, 0.35)}${pathD("M54-60l7 16 16 7-16 7-7 16-7-16-16-7 16-7z", d)}`;
    case "accessPath":
      return `${circle(-26, -42, 15, a)}${pathD("M-26-20v44l42 36M-54-2h58M-4 10l34-24", "none", b, 8)}${circle(-26, 40, 34, "none", 1).replace('fill="none"', `fill="none" stroke="${c}" stroke-width="8"`)}${pathD("M24 60h48", "none", d, 8)}`;
    case "inclusionRing":
      return `${circle(0, 0, 62, "none", 1).replace('fill="none"', `fill="none" stroke="${a}" stroke-width="12"`)}${dots([[0, -62], [54, -30], [54, 30], [0, 62], [-54, 30], [-54, -30]], [a, b, c, d], 13)}${circle(0, 0, 20, b, 0.9)}`;
    case "impactRipple":
      return `${circle(0, 0, 22, a, 0.9)}${circle(0, 0, 46, "none", 1).replace('fill="none"', `fill="none" stroke="${b}" stroke-width="7" opacity="0.68"`)}${circle(0, 0, 70, "none", 1).replace('fill="none"', `fill="none" stroke="${c}" stroke-width="6" opacity="0.5"`)}${pathD("M-76 52c46-24 106-24 152 0", "none", d, 6)}`;
    case "mapPins":
      return `${pathD("M-76 48l40-78 46 34 58-46v106l-58 30-46-34z", c, a, 4)}${[[-36, -18], [34, 0], [0, 44]].map(([x, y], i) => pathD(`M${x} ${y - 26}c16 0 26 12 26 26 0 19-26 44-26 44s-26-25-26-44c0-14 10-26 26-26z`, [a, b, d][i]) + circle(x, y, 6, ink, 0.45)).join("")}`;
    case "modularBlocks":
      return `${rect(-66, -40, 48, 48, 8, a)}${rect(-10, -40, 48, 48, 8, b)}${rect(46, -40, 48, 48, 8, c)}${rect(-38, 18, 48, 48, 8, d)}${rect(18, 18, 48, 48, 8, a, 0.85)}${pathD("M-18 8h8M38 8h8M10 42h8", "none", paper, 5, 0.45)}`;
    case "alertBeacon":
      return `${pathD("M-42 54l18-82h48l18 82z", d)}${circle(0, -28, 20, a, 0.9)}${pathD("M-76-36c20-24 40-36 76-38M76-36c-20-24-40-36-76-38M-72 64h144", "none", b, 7)}`;
    case "cityGrid":
      return `${rect(-72, -14, 30, 76, 5, a)}${rect(-34, -50, 34, 112, 5, c)}${rect(10, -28, 30, 90, 5, b)}${rect(50, -2, 28, 64, 5, d)}${pathD("M-84 66h168", "none", paper, 4, 0.35)}${pathD("M-52-30h10M-52-4h10M-20-34h8M-20-8h8M22-8h8M60 20h8", "none", ink, 5, 0.35)}`;
    case "therapyAngles":
      return `${pathD("M-60 48c28-54 58-58 96-22", "none", a, 9)}${circle(-38, -20, 17, b)}${pathD("M-38-2l36 20 36-38M-2 18l-18 44M34-20l34 36", "none", c, 9)}${pathD("M-74 66h148", "none", d, 7)}`;
    case "gameTokens":
      return `${circle(-44, 10, 32, a)}${circle(18, -22, 30, b)}${rect(20, 28, 52, 38, 10, c)}${pathD("M-58 10h28M-44-4v28M6-22h24M34 42h24M46 30v24", "none", ink, 5, 0.45)}${circle(18, -22, 7, paper, 0.65)}`;
    case "wireframe":
      return `${rect(-74, -54, 148, 108, 12, c, 0.84)}${rect(-54, -34, 48, 34, 6, a, 0.78)}${rect(12, -34, 42, 12, 5, b, 0.86)}${rect(12, -10, 34, 12, 5, d, 0.86)}${rect(-54, 18, 108, 12, 5, paper, 0.36)}${pathD("M-54 44h72", "none", a, 5)}`;
    case "browserPuzzle":
      return `${rect(-72, -54, 144, 108, 13, c, 0.86)}${pathD("M-72-24h144", "none", paper, 4, 0.3)}${circle(-54, -40, 5, d)}${circle(-36, -40, 5, b)}${pathD("M-26 12c14-20 24-2 18 10 20-12 32 18 8 28h-52c-12-18 8-32 20-18-4-10-4-16 6-20z", a)}${pathD("M18 8h30v30H18z", b)}`;
    case "forkNodes":
      return `${stroke(-62, 42, -8, -10, a, 7)}${stroke(-8, -10, 50, -46, b, 7)}${stroke(-8, -10, 60, 42, c, 7)}${circle(-62, 42, 17, a)}${circle(-8, -10, 17, d)}${circle(50, -46, 17, b)}${circle(60, 42, 17, c)}${pathD("M-74-52h52", "none", paper, 5, 0.42)}`;
    case "scales":
      return `${stroke(0, -56, 0, 58, a, 7)}${stroke(-62, -22, 62, -22, b, 6)}${pathD("M-48-22l-24 48h48zM48-22l-24 48h48z", c)}${circle(0, -56, 11, d)}${pathD("M-42 58h84", "none", a, 8)}`;
    case "safetyCone":
      return `${pathD("M-44 58l30-106h28l30 106z", d)}${pathD("M-30 10h60M-20-28h40", "none", paper, 8, 0.75)}${rect(-62, 58, 124, 18, 6, c)}${pathD("M-76-28c18-26 42-40 76-42M76-28c-18-26-42-40-76-42", "none", a, 6)}`;
    case "pill":
      return `${pathD("M-58 0a28 28 0 0 1 28-28h60a28 28 0 0 1 0 56h-60a28 28 0 0 1-28-28z", a)}${pathD("M0-28v56", "none", paper, 5, 0.48)}`;
    default:
      throw new Error(`Unknown thumbnail icon: ${name}`);
  }
}

function g(name, x, y, scale, rotate, colors) {
  return `<g transform="translate(${x} ${y}) rotate(${rotate}) scale(${scale})">${icon(name, colors)}</g>`;
}

function sceneObjects(item) {
  const key = `${item.category}|${item.group}|${item.skill}`.toLowerCase();
  const skill = item.skill.toLowerCase();
  const group = item.group.toLowerCase();

  const exact = {
    "ml": ["neuralNet", "scatterDots", "edgeNodes"],
    "deep learning": ["layerStack", "neuralNet", "sparkChip"],
    "rl": ["rewardMaze", "optimizerPath", "gameTokens"],
    "foundation models": ["foundationBlocks", "promptCards", "sparkChip"],
    "on-device ml": ["phoneChip", "edgeNodes", "neuralNet"],
    "mobile ml": ["smartphoneLayers", "phoneChip", "edgeNodes"],
    "nlp": ["speechParse", "syntaxTree", "plainDocument"],
    "computer vision": ["cameraLens", "scanSlices", "lidarFan"],
    "medical nlp": ["medicalWords", "speechParse", "heartMonitor"],
    "biomedical nlp": ["dnaText", "medicalWords", "moleculeDock"],
    "computational linguistics": ["syntaxTree", "speechParse", "knowledgeGraph"],
    "ai": ["sparkChip", "foundationBlocks", "promptCards"],
    "analytics": ["barDashboard", "scatterDots", "financeGraph"],
    "optimization": ["optimizerPath", "rewardMaze", "barDashboard"],
    "predictive maintenance": ["gearGauge", "sensorTripod", "telemetryDish"],
    "knowledge graphs": ["knowledgeGraph", "mesh", "syntaxTree"],
    "fpga": ["fpgaGrid", "quantumChip", "embeddedBoard"],
    "embedded": ["embeddedBoard", "sensorTripod", "phoneChip"],
    "semiconductor design": ["wafer", "fpgaGrid", "lattice"],
    "signal processing": ["waveform", "voiceWaves", "sensorTripod"],
    "edge computing": ["edgeCloud", "edgeNodes", "iotHub"],
    "control systems": ["feedbackLoop", "gearGauge", "simulationGrid"],
    "mechatronics": ["robotArm", "gearGauge", "embeddedBoard"],
    "structural engineering": ["bridgeTruss", "simulationGrid", "soilCore"],
    "geotechnical engineering": ["soilCore", "sensorTripod", "barDashboard"],
    "3d printing": ["printerNozzle", "lattice", "prostheticJoint"],
    "aerospace engineering": ["rocketPlane", "simulationGrid", "starMap"],
    "ocean engineering": ["oceanBuoy", "telemetryDish", "waveform"],
    "drones": ["drone", "satelliteScan", "autonomyRoad"],
    "power systems engineering": ["powerGrid", "batteryGrid", "telemetryDish"],
    "renewable energy systems": ["windSolar", "powerGrid", "batteryGrid"],
    "renewable": ["windSolar", "recyclingLoop", "fieldRows"],
    "nuclear": ["reactorCore", "powerGrid", "shieldLock"],
    "energy systems": ["batteryGrid", "powerGrid", "windSolar"],
    "cloud": ["cloudServer", "edgeCloud", "clusterStack"],
    "hpc": ["clusterStack", "simulationGrid", "cloudServer"],
    "blockchain": ["ledgerBlocks", "keyPair", "mesh"],
    "real-time": ["realTimeClock", "telemetryDish", "waveform"],
    "mesh networks": ["mesh", "telemetryDish", "iotHub"],
    "security": ["shieldLock", "keyPair", "privacyWindow"],
    "privacy": ["privacyWindow", "shieldLock", "keyPair"],
    "cryptography": ["keyPair", "quantumGates", "shieldLock"],
    "simulation": ["simulationGrid", "twinMirrors", "barDashboard"],
    "telemetry": ["telemetryDish", "realTimeClock", "sensorTripod"],
    "digital twins": ["twinMirrors", "simulationGrid", "embeddedBoard"],
    "genomics": ["genome", "dnaText", "barDashboard"],
    "proteomics": ["proteinFold", "moleculeDock", "lattice"],
    "synthetic biology": ["cellFactory", "genome", "moleculeDock"],
    "computational biology": ["cellCluster", "barDashboard", "genome"],
    "marine biology": ["marineScope", "cellCluster", "waterDrop"],
    "anesthesiology": ["maskGauge", "heartMonitor", "medicalWords"],
    "dentistry": ["tooth", "scanSlices", "medicalWords"],
    "neurosurgery": ["brainScan", "neuroChip", "scanSlices"],
    "palliative medicine": ["careLamp", "heartMonitor", "homeHeart"],
    "immunotherapy": ["antibody", "cellCluster", "medicalWords"],
    "veterinary oncology": ["vetScope", "medicalWords", "cellCluster"],
    "biomedical imaging": ["scanSlices", "medicalWords", "cameraLens"],
    "imaging": ["scanSlices", "cameraLens", "prism"],
    "tissue engineering": ["tissueScaffold", "cellFactory", "lattice"],
    "neuroprosthetics": ["neuroChip", "prostheticJoint", "brainScan"],
    "prosthetics": ["prostheticJoint", "printerNozzle", "therapyAngles"],
    "emg": ["emgPulse", "prostheticJoint", "wearableBand"],
    "pharmacogenomics": ["pillGene", "genome", "moleculeDock"],
    "health monitoring": ["heartMonitor", "wearableBand", "telemetryDish"],
    "rural health": ["ruralMap", "homeHeart", "medicalWords"],
    "climate informatics": ["climateMap", "barDashboard", "satelliteScan"],
    "air quality": ["airParticles", "sensorTripod", "climateMap"],
    "sustainability": ["recyclingLoop", "saplings", "windSolar"],
    "carbon markets": ["carbonCoins", "financeGraph", "climateMap"],
    "climate finance": ["financeGraph", "carbonCoins", "climateMap"],
    "agriculture": ["fieldRows", "cropLeaf", "satelliteScan"],
    "crop science": ["cropLeaf", "fieldRows", "genome"],
    "ecology": ["ecologyWeb", "saplings", "marineScope"],
    "reforestation": ["saplings", "satelliteScan", "recyclingLoop"],
    "remote sensing": ["satelliteScan", "climateMap", "lidarFan"],
    "volcanology": ["volcano", "sensorTripod", "satelliteScan"],
    "environmental toxicology": ["toxinVial", "waterDrop", "airParticles"],
    "water quality": ["waterDrop", "sensorTripod", "toxinVial"],
    "nuclear physics": ["atom", "reactorCore", "plasma"],
    "plasma physics": ["plasma", "atom", "waveform"],
    "astrophysics": ["starMap", "atom", "satelliteScan"],
    "quantum": ["quantumGates", "atom", "prism"],
    "quantum chemistry": ["flask", "atom", "moleculeDock"],
    "quantum hardware": ["quantumChip", "quantumGates", "wafer"],
    "materials science": ["lattice", "wafer", "nanotubes"],
    "nanotech": ["nanotubes", "lattice", "wafer"],
    "robotics": ["robotArm", "embeddedBoard", "sensorTripod"],
    "control theory": ["feedbackLoop", "simulationGrid", "optimizerPath"],
    "wearables": ["wearableBand", "heartMonitor", "hapticPads"],
    "lidar": ["lidarFan", "autonomyRoad", "sensorTripod"],
    "haptics": ["hapticPads", "wearableBand", "waveform"],
    "ar/vr": ["vrHeadset", "arFrame", "wireframe"],
    "ar": ["arFrame", "cameraLens", "colorWheel"],
    "color science": ["colorWheel", "prism", "cameraLens"],
    "voice ui": ["voiceWaves", "speechParse", "wireframe"],
    "behavioral economics": ["choiceGraph", "gameTokens", "barDashboard"],
    "forensic accounting": ["ledgerMagnify", "lawBook", "barDashboard"],
    "education": ["bookSpark", "adaptivePath", "plainDocument"],
    "accessibility": ["accessPath", "wireframe", "voiceWaves"],
    "inclusion": ["inclusionRing", "accessPath", "modularBlocks"],
    "social impact": ["impactRipple", "mapPins", "modularBlocks"],
    "refugee tech": ["mapPins", "ruralMap", "impactRipple"],
    "community": ["modularBlocks", "impactRipple", "mapPins"],
    "disaster response": ["alertBeacon", "mapPins", "telemetryDish"],
    "urban planning": ["cityGrid", "mapPins", "simulationGrid"],
    "physical therapy": ["therapyAngles", "wearableBand", "heartMonitor"],
    "gamification": ["gameTokens", "rewardMaze", "choiceGraph"],
    "ux": ["wireframe", "choiceGraph", "colorWheel"],
    "browser extensions": ["browserPuzzle", "wireframe", "forkNodes"],
    "open source": ["forkNodes", "modularBlocks", "browserPuzzle"],
    "ethics": ["scales", "lawBook", "impactRipple"],
    "safety": ["safetyCone", "shieldLock", "alertBeacon"],
  };

  if (skill === "adaptive learning" && group === "education & accessibility") return ["bookSpark", "adaptivePath", "accessPath"];
  if (skill === "adaptive learning") return ["adaptivePath", "sliderTiles", "neuralNet"];
  if (skill === "plain language" && group === "web & browser") return ["plainDocument", "browserPuzzle", "accessPath"];
  if (skill === "plain language") return ["plainDocument", "speechParse", "bookSpark"];
  if (skill === "drug discovery" && key.includes("pharma")) return ["pillGene", "moleculeDock", "flask"];
  if (skill === "drug discovery") return ["moleculeDock", "flask", "proteinFold"];
  if (skill === "photonics" && key.includes("materials")) return ["prism", "lattice", "quantumChip"];
  if (skill === "photonics") return ["prism", "waveform", "wafer"];
  if (skill === "autonomous" && key.includes("robotics")) return ["autonomyRoad", "robotArm", "lidarFan"];
  if (skill === "autonomous") return ["autonomyRoad", "drone", "satelliteScan"];
  if (skill === "agricultural robotics" && key.includes("robotics & hardware")) return ["robotArm", "fieldRobot", "feedbackLoop"];
  if (skill === "agricultural robotics") return ["fieldRobot", "cropLeaf", "fieldRows"];
  if (skill === "iot" && key.includes("sensors")) return ["iotHub", "wearableBand", "sensorTripod"];
  if (skill === "iot") return ["iotHub", "edgeCloud", "mesh"];
  if (skill === "sensors" && key.includes("earth")) return ["sensorTripod", "waterDrop", "airParticles"];
  if (skill === "sensors") return ["sensorTripod", "iotHub", "wearableBand"];
  if (skill === "data privacy law" && key.includes("economics")) return ["lawBook", "privacyWindow", "ledgerMagnify"];
  if (skill === "data privacy law") return ["privacyWindow", "lawBook", "shieldLock"];
  if (skill === "elder care" && key.includes("wellness")) return ["homeHeart", "therapyAngles", "heartMonitor"];
  if (skill === "elder care") return ["homeHeart", "careLamp", "heartMonitor"];

  return exact[skill] || ["foundationBlocks", "barDashboard", "sparkChip"];
}

function sceneBackground(colors, seed) {
  const [a, b, c, d] = colors;
  const ridge = 134 + (seed % 26);
  return `
    <rect width="360" height="210" rx="24" fill="url(#bg)"/>
    <rect width="360" height="210" rx="24" fill="url(#pulse)"/>
    <path d="M0 ${ridge}c54-22 92-4 140-26 70-32 106-70 220-48v118H0z" fill="${c}" opacity="0.2"/>
    <path d="M0 ${ridge + 44}c70-22 112 0 174-18 64-18 106-12 186 8v62H0z" fill="${a}" opacity="0.08"/>
    <circle cx="${276 + (seed % 36)}" cy="${34 + (seed % 34)}" r="${34 + (seed % 12)}" fill="${d}" opacity="0.12"/>
    <circle cx="${44 + (seed % 34)}" cy="${154 + (seed % 24)}" r="${24 + (seed % 10)}" fill="${b}" opacity="0.1"/>
  `;
}

function svgFor(item, index) {
  const identity = `${item.category}|${item.group}|${item.skill}|${index}`;
  const seed = hash(identity);
  const colors = palettes[seed % palettes.length];
  const selectedLayout = layouts[seed % layouts.length];
  const objects = sceneObjects(item);
  const scene = objects.map((name, i) => {
    const [x, y, scale, rotate] = selectedLayout[i];
    return g(name, x, y, scale, rotate, colors);
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 210" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(item.skill)} thumbnail</title>
  <desc id="desc">A no-people thumbnail scene for ${escapeXml(item.skill)} in ${escapeXml(item.group)}.</desc>
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#18263a"/>
      <stop offset="0.52" stop-color="#203752"/>
      <stop offset="1" stop-color="#101821"/>
    </linearGradient>
    <radialGradient id="pulse" cx="80%" cy="14%" r="82%">
      <stop offset="0" stop-color="${colors[0]}" stop-opacity="0.38"/>
      <stop offset="0.45" stop-color="${colors[1]}" stop-opacity="0.2"/>
      <stop offset="1" stop-color="${colors[2]}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  ${sceneBackground(colors, seed)}
  <g filter="drop-shadow(0 9px 12px rgb(0 0 0 / 0.18))">
    ${scene}
  </g>
</svg>
`;
}

function placeholderSvg() {
  return svgFor({ skill: "Skilf project", category: "General", group: "Project idea" }, 0);
}

function batchItems(items, batchSize) {
  const out = [];
  for (let i = 0; i < items.length; i += batchSize) {
    out.push({
      number: out.length + 1,
      start: i + 1,
      end: Math.min(i + batchSize, items.length),
      items: items.slice(i, i + batchSize),
    });
  }
  return out;
}

const tree = readJson(skillTreePath);
const leaves = flattenSkillTree(tree);
const uniqueSkills = [...new Set(leaves.map((item) => item.skill))];
const batchSize = Number(process.argv[2] || 30);

fs.mkdirSync(outDir, { recursive: true });
for (const file of fs.readdirSync(outDir)) {
  if (file.endsWith(".svg")) fs.unlinkSync(path.join(outDir, file));
}
fs.writeFileSync(path.join(outDir, "placeholder.svg"), placeholderSvg(), "utf8");

const items = leaves.map((item, index) => {
  const slug = slugify(item.skill);
  const file = `${String(index + 1).padStart(3, "0")}-${slug}.svg`;
  const concepts = sceneObjects(item);
  fs.writeFileSync(path.join(outDir, file), svgFor(item, index), "utf8");
  return {
    index: index + 1,
    batch: Math.floor(index / batchSize) + 1,
    skill: item.skill,
    category: item.category,
    group: item.group,
    slug,
    concepts,
    file: `assets/skilf-thumbnails/${file}`,
  };
});

const manifest = {
  source: "skill-tree.json",
  totalSkillTreeLeaves: leaves.length,
  uniqueSkillNames: uniqueSkills.length,
  batchSize,
  generatedItems: items.length,
  placeholder: "assets/skilf-thumbnails/placeholder.svg",
  batches: batchItems(items, batchSize),
  items,
};

fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Generated ${items.length} thumbnails in ${batchItems(items, batchSize).length} batches of ${batchSize}.`);
