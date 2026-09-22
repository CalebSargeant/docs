// Arithmatex in `generic: true` mode emits \(…\) and \[…\] and leaves the
// rendering to MathJax, so MathJax has to be told those are the delimiters.
//
// The subscribe block re-typesets after navigation.instant swaps the page in.
// Without it the first maths block a reader lands on renders and every one they
// navigate to afterwards stays raw TeX, which looks like a content bug.
window.MathJax = {
  tex: {
    inlineMath: [["\\(", "\\)"]],
    displayMath: [["\\[", "\\]"]],
    processEscapes: true,
    processEnvironments: true,
  },
  options: {
    ignoreHtmlClass: ".*|",
    processHtmlClass: "arithmatex",
  },
};

document$.subscribe(() => {
  MathJax.startup.output.clearCache();
  MathJax.typesetClear();
  MathJax.texReset();
  MathJax.typesetPromise();
});
