// The factory's colour conversions, from Illustrator's own colour settings, as
// tables for the website:
// - RGB → CMYK (apps/api/src/bibs/factory-cmyk.json): a colour picked off the
//   DTP chart prints as Illustrator would make it;
// - CMYK → RGB (apps/web/public/designer/factory-rgb.js): a CMYK typed into the
//   designer shows on screen as Illustrator shows it.
// Run on the print-manager PC, with Illustrator set up as the factory's:
//   cscript //nologo scripts\bibs\run-jsx.vbs scripts\factory-cmyk.jsx
// Read only: it opens and changes no document.
#target illustrator
(function () {
  var out = new File(new File($.fileName).parent.parent + "/apps/api/src/bibs/factory-cmyk.json");
  var N = 17, grid = [], cmyk = [];
  for (var i = 0; i < N; i++) grid.push(Math.min(255, i * 16));
  for (var r = 0; r < N; r++) for (var g = 0; g < N; g++) for (var b = 0; b < N; b++) {
    var c = app.convertSampleColor(ImageColorSpace.RGB, [grid[r], grid[g], grid[b]], ImageColorSpace.CMYK, ColorConvertPurpose.defaultpurpose);
    for (var k = 0; k < 4; k++) cmyk.push(Math.round(c[k] * 10) / 10);
  }
  out.encoding = "UTF-8";
  out.lineFeed = "Unix";
  out.open("w");
  out.write('{\n  "about": "RGB to CMYK by the factory\'s Illustrator colour settings (scripts/factory-cmyk.jsx); cmyk: 4 values per grid point, r then g then b",\n  "grid": [' + grid.join(",") + '],\n  "cmyk": [' + cmyk.join(",") + ']\n}\n');
  out.close();

  var web = new File(new File($.fileName).parent.parent + "/apps/web/public/designer/factory-rgb.js");
  var M = 9, steps = [], rgb = [];
  for (var j = 0; j < M; j++) steps.push(j * 12.5);
  for (var c0 = 0; c0 < M; c0++) for (var m0 = 0; m0 < M; m0++) for (var y0 = 0; y0 < M; y0++) for (var k0 = 0; k0 < M; k0++) {
    var v = app.convertSampleColor(ImageColorSpace.CMYK, [steps[c0], steps[m0], steps[y0], steps[k0]], ImageColorSpace.RGB, ColorConvertPurpose.defaultpurpose);
    for (var q = 0; q < 3; q++) rgb.push(Math.round(v[q]));
  }
  web.encoding = "UTF-8";
  web.lineFeed = "Unix";
  web.open("w");
  web.write("/* CMYK to screen RGB by the factory's Illustrator colour settings (scripts/factory-cmyk.jsx): rgb, 3 values per grid point, c then m then y then k */\n");
  web.write('window.AXIOM_CMYK_RGB={"grid":[' + steps.join(",") + '],"rgb":[' + rgb.join(",") + ']};\n');
  web.close();
})();
