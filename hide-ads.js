/**
 * grafana-noads: hides Enterprise/Cloud upsell UI in the OSS build.
 *
 * Verified against Grafana 13.0.8 (public/app source as of that tag).
 * Grafana ships none of this behind a config flag, so this works by
 * pattern-matching the rendered DOM at runtime (component classNames are
 * webpack/emotion-hashed and not stable across builds, so matching goes by
 * stable attributes -> href substrings -> exact i18n text, in that order).
 *
 * If Grafana renames these strings/routes in a later version, the affected
 * rule below will simply stop matching (fails open — nothing breaks, the ad
 * just reappears). Re-verify rules after bumping the image tag.
 */
(function () {
  'use strict';

  var HIDDEN_MARK = 'data-grafana-noads-hidden';

  function hide(el) {
    if (!el || el.nodeType !== 1 || el.getAttribute(HIDDEN_MARK)) {
      return;
    }
    el.setAttribute(HIDDEN_MARK, '1');
    el.style.setProperty('display', 'none', 'important');
  }

  function findByExactText(tagNames, text) {
    var out = [];
    for (var i = 0; i < tagNames.length; i++) {
      var els = document.getElementsByTagName(tagNames[i]);
      for (var j = 0; j < els.length; j++) {
        if (els[j].textContent && els[j].textContent.trim() === text) {
          out.push(els[j]);
        }
      }
    }
    return out;
  }

  // Climbs while the parent stays under maxHeightRatio of the viewport, so a
  // loose text match can't accidentally take out the whole page.
  function climbSafe(el, maxLevels, maxHeightRatio) {
    var current = el;
    for (var i = 0; i < maxLevels; i++) {
      var parent = current.parentElement;
      if (!parent || parent.tagName === 'BODY' || parent.tagName === 'MAIN') {
        break;
      }
      var rect = parent.getBoundingClientRect();
      if (rect.height > window.innerHeight * maxHeightRatio) {
        break;
      }
      current = parent;
    }
    return current;
  }

  // Climbs all the way up to the element whose parent is <main>/<body> — for
  // rules where the "ad" IS the entire page content, not a card within it.
  function climbToPageRoot(el) {
    var current = el;
    while (current.parentElement && current.parentElement.tagName !== 'MAIN' && current.parentElement.tagName !== 'BODY') {
      current = current.parentElement;
    }
    return current;
  }

  var RULES = [
    // 1. Nav item "Stats and license" -> /admin/upgrading (admin.navEntry.ts)
    {
      id: 'nav-upgrading',
      run: function () {
        var links = document.querySelectorAll('a[href="/admin/upgrading"]');
        for (var i = 0; i < links.length; i++) {
          hide(links[i].closest('li') || links[i]);
        }
      },
    },

    // 2. /admin/upgrading full page (UpgradePage.tsx / LicenseChrome.tsx)
    {
      id: 'upgrade-page',
      run: function () {
        var links = document.querySelectorAll('a[href*="grafana.com/contact?about=grafana-enterprise"]');
        for (var i = 0; i < links.length; i++) {
          hide(climbToPageRoot(links[i]));
        }
      },
    },

    // 3. EnterpriseAuthFeaturesCard.tsx (Users / Teams admin pages)
    {
      id: 'enterprise-auth-card',
      run: function () {
        var headings = findByExactText(['H1', 'H2', 'H3', 'H4', 'DIV', 'SPAN'], 'Enterprise authentication');
        for (var i = 0; i < headings.length; i++) {
          hide(climbSafe(headings[i], 5, 0.5));
        }
      },
    },

    // 4. Alerting home AdCard.tsx — "Learn more" link inside a card that also
    //    mentions Cloud/Enterprise. Heuristic (no stable attributes exposed).
    {
      id: 'alerting-ad-card',
      run: function () {
        var candidates = findByExactText(['A', 'BUTTON'], 'Learn more');
        for (var i = 0; i < candidates.length; i++) {
          var container = candidates[i].closest('div');
          if (container && /cloud/i.test(container.textContent) && /enterprise/i.test(container.textContent)) {
            hide(climbSafe(candidates[i], 5, 0.4));
          }
        }
      },
    },

    // 5. Connections "Feature highlight" tab pages (Insights/Cache/Permissions)
    {
      id: 'feature-highlight-pages',
      run: function () {
        var links = findByExactText(['A'], 'Learn about Enterprise');
        for (var i = 0; i < links.length; i++) {
          hide(climbToPageRoot(links[i]));
        }
      },
    },

    // 6. Plugin/datasource "Enterprise" lock badges (PluginEnterpriseBadge.tsx,
    //    CardGrid.tsx)
    {
      id: 'plugin-enterprise-badge',
      run: function () {
        var badges = document.querySelectorAll(
          '[aria-label="Enterprise"][role="img"], [title="Requires a Grafana Enterprise license"]'
        );
        for (var i = 0; i < badges.length; i++) {
          hide(badges[i]);
        }
      },
    },

    // 7. InstallControlsWarning.tsx ("only available in Grafana Cloud and
    //    Grafana Enterprise" alert on enterprise plugin pages)
    {
      id: 'install-controls-warning',
      run: function () {
        var alerts = document.querySelectorAll('[role="alert"]');
        for (var i = 0; i < alerts.length; i++) {
          if (alerts[i].textContent.indexOf('only available in Grafana Cloud and Grafana Enterprise') !== -1) {
            hide(alerts[i]);
          }
        }
      },
    },
  ];

  function runAll() {
    for (var i = 0; i < RULES.length; i++) {
      try {
        RULES[i].run();
      } catch (e) {
        // A single rule failing (e.g. DOM shape changed) shouldn't block the rest.
      }
    }
  }

  var debounceHandle = null;
  function scheduleRun() {
    if (debounceHandle) {
      return;
    }
    debounceHandle = window.setTimeout(function () {
      debounceHandle = null;
      runAll();
    }, 50);
  }

  document.addEventListener('DOMContentLoaded', scheduleRun);
  runAll();

  var observer = new MutationObserver(scheduleRun);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Re-run on SPA client-side navigation (React Router uses pushState/replaceState).
  ['pushState', 'replaceState'].forEach(function (method) {
    var original = history[method];
    history[method] = function () {
      var result = original.apply(this, arguments);
      scheduleRun();
      return result;
    };
  });
  window.addEventListener('popstate', scheduleRun);
})();
