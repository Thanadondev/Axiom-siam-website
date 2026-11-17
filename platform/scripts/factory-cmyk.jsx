// The factory's RGB → CMYK conversion, from Illustrator's own colour settings,
// as a table for the website (apps/api/src/bibs/factory-cmyk.json): a colour
// typed in off the DTP chart prints as Illustrator would make it.
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
})();
