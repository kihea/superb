/* The library page's search: a plain substring filter over the rows the
   build already printed into the page. No fetch, no index -- the page IS
   the index. */
(function () {
  'use strict';
  var input = document.getElementById('lib-search');
  var none = document.getElementById('lib-none');
  if (!input) return;
  var books = Array.prototype.slice.call(document.querySelectorAll('.lib-book'));
  var groups = Array.prototype.slice.call(document.querySelectorAll('.lib-group'));
  books.forEach(function (b) { b.__key = (b.textContent || '').toLowerCase(); });

  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    var hits = 0;
    books.forEach(function (b) {
      var show = !q || b.__key.indexOf(q) !== -1;
      b.style.display = show ? '' : 'none';
      if (show) hits++;
    });
    groups.forEach(function (g) {
      var any = g.querySelector('.lib-book:not([style*="none"])');
      g.style.display = any ? '' : 'none';
    });
    if (none) none.style.display = hits ? 'none' : 'block';
  });
})();
