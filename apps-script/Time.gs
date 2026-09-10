// Relative-time formatting. absoluteUtc_ is the server-rendered fallback;
// CLIENT_SCRIPT_ (inlined into the page by RenderPage.gs) upgrades
// [data-at] elements to relative time once on load.

function absoluteUtc_(isoString) {
  return new Date(isoString).toISOString().slice(11, 16) + ' UTC';
}

var CLIENT_SCRIPT_ = [
  '(function(){',
  '  function rel(iso){',
  '    var then=new Date(iso), now=new Date(), diff=now-then;',
  '    var MIN=60000,HOUR=3600000,DAY=86400000;',
  "    if(diff<MIN) return 'just now';",
  "    if(diff<HOUR) return Math.floor(diff/MIN)+'m ago';",
  "    if(diff<DAY) return Math.floor(diff/HOUR)+'h ago';",
  '    var sToday=new Date(now.getFullYear(),now.getMonth(),now.getDate());',
  '    var sThen=new Date(then.getFullYear(),then.getMonth(),then.getDate());',
  '    var dayDiff=Math.round((sToday-sThen)/DAY);',
  "    if(dayDiff===1) return 'Yesterday';",
  "    if(dayDiff<7) return dayDiff+'d ago';",
  '    return then.toISOString().slice(0,10);',
  '  }',
  "  var els=document.querySelectorAll('[data-at]');",
  '  for(var i=0;i<els.length;i++){',
  "    var iso=els[i].getAttribute('data-at');",
  '    if(iso) els[i].textContent=rel(iso);',
  '  }',
  '})();'
].join('\n');
