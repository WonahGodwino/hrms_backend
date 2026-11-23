const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const mdPath = path.join(__dirname, '../../docs/modules/performance-appraisal/testing/PA_User_Guide.md');
const tempHtmlPath = path.join(__dirname, '../../docs/modules/performance-appraisal/testing/temp_content.html');
const outputHtmlPath = path.join(__dirname, '../../docs/modules/performance-appraisal/testing/PA_User_Guide.html');
const outputCssPath = path.join(__dirname, '../../docs/modules/performance-appraisal/testing/PA_User_Guide.css');

console.log('1. Converting Markdown to HTML via marked...');
execSync(`npx marked -i "${mdPath}" -o "${tempHtmlPath}" --gfm`, {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit'
});

let rawHtml = fs.readFileSync(tempHtmlPath, 'utf8');

// Clean up temp file
try {
  fs.unlinkSync(tempHtmlPath);
} catch (e) {}

// Slugify helper
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '') // remove html tags
    .replace(/&[a-z0-9]+;/g, '') // remove entities
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

console.log('2. Processing Headings & Building Table of Contents...');
const tocItems = [];
const seenSlugs = {};

rawHtml = rawHtml.replace(/<h([1-4])>(.*?)<\/h\1>/gi, (match, level, text) => {
  let cleanText = text.replace(/<[^>]+>/g, '').trim();
  let slug = slugify(cleanText);
  if (!slug) slug = 'section';
  if (seenSlugs[slug]) {
    seenSlugs[slug]++;
    slug = `${slug}-${seenSlugs[slug]}`;
  } else {
    seenSlugs[slug] = 1;
  }

  const lvl = parseInt(level, 10);
  if (lvl === 2 || lvl === 3) {
    tocItems.push({
      level: lvl,
      text: cleanText,
      slug: slug
    });
  }

  return `<h${lvl} id="${slug}" class="heading-anchor-group">
    <span>${text}</span>
    <a href="#${slug}" class="heading-anchor" aria-label="Permalink to this section">#</a>
  </h${lvl}>`;
});

console.log('3. Transforming Status Tags & Callout Badges...');
// Status tags
rawHtml = rawHtml.replace(
  /\[Status tag:\s*Built\]/gi,
  '<span class="badge badge-built"><span class="badge-dot"></span>Built</span>'
);
rawHtml = rawHtml.replace(
  /\[Status tag:\s*Partly built\]/gi,
  '<span class="badge badge-partly"><span class="badge-dot"></span>Partly built</span>'
);

// Standalone Verify paragraph: <p>Verify → TC-001, TC-002...</p>
rawHtml = rawHtml.replace(
  /<p>Verify\s*(?:→|-&gt;)\s*([A-Z0-9_-]+(?:\s*,\s*[A-Z0-9_-]+)*)<\/p>/gi,
  (match, tcList) => {
    const tcs = tcList.split(',').map(s => s.trim()).filter(Boolean);
    const chips = tcs.map(tc => `<span class="tc-chip" title="Test Case ID">${tc}</span>`).join('');
    return `<div class="verify-callout">
      <div class="verify-callout-header">
        <span class="verify-icon">🎯</span>
        <span class="verify-label">Verify Target Cases</span>
      </div>
      <div class="verify-chips">${chips}</div>
    </div>`;
  }
);

// Inline Verify: Verify → TC-001
rawHtml = rawHtml.replace(
  /Verify\s*(?:→|-&gt;)\s*([A-Z0-9_-]+(?:\s*,\s*[A-Z0-9_-]+)*)/g,
  (match, tcList) => {
    const tcs = tcList.split(',').map(s => s.trim()).filter(Boolean);
    const chips = tcs.map(tc => `<span class="tc-chip" title="Test Case ID">${tc}</span>`).join(' ');
    return `<span class="verify-badge"><span class="verify-prefix">Verify →</span> ${chips}</span>`;
  }
);

// Format blockquotes nicely
rawHtml = rawHtml.replace(
  /<blockquote>\s*<p>\s*<em>\s*Failed\./gi,
  '<blockquote class="callout-example callout-poor"><div class="callout-badge badge-poor">❌ Poor Actual Result (Unusable)</div><p><em>Failed.'
);
rawHtml = rawHtml.replace(
  /<blockquote>\s*<p>\s*Failed on Step/gi,
  '<blockquote class="callout-example callout-good"><div class="callout-badge badge-good">✅ Good Actual Result (Professional)</div><p>Failed on Step'
);

console.log('4. Formatting Tables & Copyable Credentials...');
// Transform code tags with emails or passwords to copyable credentials
rawHtml = rawHtml.replace(/<code>([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})<\/code>/g, (m, email) => {
  return `<code class="copyable-credential" onclick="copyCredential(this)" data-copy="${email}" title="Click to copy email">${email} <span class="copy-icon">📋</span></code>`;
});
rawHtml = rawHtml.replace(/<code>Password123!<\/code>/g, () => {
  return `<code class="copyable-credential" onclick="copyCredential(this)" data-copy="Password123!" title="Click to copy password">Password123! <span class="copy-icon">📋</span></code>`;
});

// Wrap tables in responsive container (distinguish credentials tables)
rawHtml = rawHtml.replace(/<table>([\s\S]*?)<\/table>/gi, (match, inner) => {
  const isCreds = inner.includes('Login Email') || inner.includes('Password') || inner.includes('Persona');
  const cls = isCreds ? 'table-responsive creds-table-wrapper' : 'table-responsive';
  return `<div class="${cls}"><table>${inner}</table></div>`;
});

// Mermaid blocks
rawHtml = rawHtml.replace(
  /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/gi,
  (match, code) => {
    const unescaped = code
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    return `<div class="mermaid-wrapper">
      <div class="mermaid-header">
        <div class="mermaid-title-group">
          <span class="mermaid-icon">📊</span>
          <span class="mermaid-title">Appraisal Workflow Diagram</span>
        </div>
        <span class="mermaid-hint">Interactive Flowchart</span>
      </div>
      <div class="mermaid">${unescaped}</div>
    </div>`;
  }
);

console.log('5. Assembling Responsive Sidebar & Navigation Tree...');
let sidebarHtml = `
<aside class="guide-sidebar" id="guideSidebar">
  <div class="sidebar-header">
    <div class="brand-logo">
      <span class="brand-badge">247HR</span>
      <span class="brand-title">P&A QA Guide</span>
    </div>
    <div class="search-box">
      <input type="text" id="tocSearch" placeholder="Filter sections, modules, cases..." autocomplete="off" />
      <span class="search-icon">🔍</span>
    </div>
  </div>
  <nav class="sidebar-nav" id="sidebarNav">
    <ul class="toc-list">
`;

let currentH2 = null;
tocItems.forEach((item) => {
  if (item.level === 2) {
    if (currentH2) {
      sidebarHtml += `</ul></li>`;
    }
    currentH2 = item;
    sidebarHtml += `
      <li class="toc-group" data-title="${item.text.toLowerCase()}">
        <a href="#${item.slug}" class="toc-h2-link">${item.text}</a>
        <ul class="toc-sublist">
    `;
  } else if (item.level === 3 && currentH2) {
    sidebarHtml += `
      <li class="toc-item" data-title="${item.text.toLowerCase()}">
        <a href="#${item.slug}" class="toc-h3-link">${item.text}</a>
      </li>
    `;
  }
});

if (currentH2) {
  sidebarHtml += `</ul></li>`;
}

sidebarHtml += `
    </ul>
  </nav>
  <div class="sidebar-footer">
    <div class="workbook-meta">
      <span class="meta-label">Master Sync:</span>
      <span class="meta-val">PA_Test_Workbook.xlsx</span>
    </div>
  </div>
</aside>
`;

console.log('6. Building Complete HTML5 Template...');
const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="247HR Performance & Appraisal (P&A) User & Tester Guide — Complete operational reference, business rules, and test crosswalk.">
  <title>247HR Performance & Appraisal (P&A) — User & Tester Guide</title>
  <link rel="stylesheet" href="PA_User_Guide.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({
      startOnLoad: true,
      theme: 'neutral',
      flowchart: { curve: 'basis', htmlLabels: true },
      fontFamily: 'Inter, sans-serif'
    });
  </script>
</head>
<body data-theme="light">
  <!-- Reading Progress Bar -->
  <div class="progress-bar-container">
    <div class="progress-bar" id="progressBar"></div>
  </div>

  <!-- Top App Navigation Bar -->
  <header class="top-nav">
    <div class="nav-left">
      <button class="menu-toggle-btn" id="menuToggleBtn" aria-label="Toggle navigation sidebar">
        <span class="bar"></span>
        <span class="bar"></span>
        <span class="bar"></span>
      </button>
      <div class="doc-title-group">
        <span class="doc-badge">P&amp;A MODULE</span>
        <h1 class="top-doc-title">User &amp; Tester Guide</h1>
      </div>
    </div>
    <div class="nav-right">
      <button class="nav-btn print-btn" id="printBtn" title="Print or Save as PDF">
        🖨️ <span class="btn-text">Print / PDF</span>
      </button>
      <button class="nav-btn theme-toggle-btn" id="themeToggleBtn" title="Toggle Light/Dark Theme">
        <span class="theme-icon">🌙</span> <span class="theme-text">Dark Mode</span>
      </button>
    </div>
  </header>

  <!-- Layout Container -->
  <div class="guide-layout">
    ${sidebarHtml}

    <main class="guide-main" id="mainContent">
      <article class="content-wrapper">
        ${rawHtml}
      </article>

      <footer class="content-footer">
        <div class="footer-card">
          <h4>247HR Quality Assurance &amp; Product Operations</h4>
          <p>This guide serves as the definitive plain-language manual for the Performance &amp; Appraisal module, synchronised with <code>PA_Test_Workbook.xlsx</code> and repository commit <code>f492b2db</code>.</p>
          <div class="footer-links">
            <span>Workbook: <code>PA_Test_Workbook.xlsx</code></span>
            <span>•</span>
            <span>Crosswalk: <code>PA_Guide_Crosswalk.csv</code></span>
            <span>•</span>
            <span>Plan: <code>PA_Test_Plan.md</code></span>
          </div>
        </div>
      </footer>
    </main>
  </div>

  <!-- Back to top button -->
  <button class="back-to-top" id="backToTop" title="Scroll to top" aria-label="Scroll to top">
    ↑
  </button>

  <!-- Toast Notification Container -->
  <div class="guide-toast" id="guideToast"></div>

  <script>
    // 1. Theme toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    const themeIcon = themeBtn.querySelector('.theme-icon');
    const themeText = themeBtn.querySelector('.theme-text');
    const savedTheme = localStorage.getItem('pa_guide_theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    updateThemeUI(savedTheme);

    themeBtn.addEventListener('click', () => {
      const current = document.body.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.body.setAttribute('data-theme', next);
      localStorage.setItem('pa_guide_theme', next);
      updateThemeUI(next);
    });

    function updateThemeUI(theme) {
      if (theme === 'dark') {
        themeIcon.textContent = '☀️';
        themeText.textContent = 'Light Mode';
      } else {
        themeIcon.textContent = '🌙';
        themeText.textContent = 'Dark Mode';
      }
    }

    // 2. Reading progress bar
    window.addEventListener('scroll', () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = totalHeight > 0 ? (window.scrollY / totalHeight) * 100 : 0;
      document.getElementById('progressBar').style.width = Math.min(progress, 100) + '%';

      // Back to top visibility
      const backToTop = document.getElementById('backToTop');
      if (window.scrollY > 400) {
        backToTop.classList.add('visible');
      } else {
        backToTop.classList.remove('visible');
      }
    });

    document.getElementById('backToTop').addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 3. Mobile sidebar toggle
    const menuToggle = document.getElementById('menuToggleBtn');
    const sidebar = document.getElementById('guideSidebar');
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    // Close sidebar on link click (mobile)
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 1024) {
          sidebar.classList.remove('open');
        }
      });
    });

    // 4. Print action
    document.getElementById('printBtn').addEventListener('click', () => {
      window.print();
    });

    // 5. TOC Search / Filter
    const searchInput = document.getElementById('tocSearch');
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const groups = document.querySelectorAll('.toc-group');
      groups.forEach(group => {
        const groupTitle = group.getAttribute('data-title') || '';
        const items = group.querySelectorAll('.toc-item');
        let anyVisible = false;

        items.forEach(item => {
          const itemTitle = item.getAttribute('data-title') || '';
          if (!q || itemTitle.includes(q) || groupTitle.includes(q)) {
            item.style.display = '';
            anyVisible = true;
          } else {
            item.style.display = 'none';
          }
        });

        if (!q || anyVisible || groupTitle.includes(q)) {
          group.style.display = '';
        } else {
          group.style.display = 'none';
        }
      });
    });

    // 6. Active Scrollspy for Table of Contents
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          document.querySelectorAll('.sidebar-nav a').forEach(a => {
            if (a.getAttribute('href') === '#' + id) {
              a.classList.add('active');
              a.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
              a.classList.remove('active');
            }
          });
        }
      });
    }, { rootMargin: '-80px 0px -70% 0px' });

    document.querySelectorAll('.heading-anchor-group').forEach(h => observer.observe(h));

    // 7. Click-to-copy Credentials with Toast Notification
    function showToast(msg) {
      const toast = document.getElementById('guideToast');
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2200);
    }

    window.copyCredential = function(el) {
      const val = el.getAttribute('data-copy');
      if (!val) return;
      navigator.clipboard.writeText(val).then(() => {
        showToast('Copied: ' + val);
        const origBg = el.style.backgroundColor;
        el.style.backgroundColor = '#d1fae5';
        setTimeout(() => {
          el.style.backgroundColor = origBg;
        }, 600);
      }).catch(() => {
        showToast('Copied: ' + val);
      });
    };
  </script>
</body>
</html>
`;

fs.writeFileSync(outputHtmlPath, fullHtml, 'utf8');
console.log(`\n✅ Generated HTML: ${outputHtmlPath} (${fullHtml.length} bytes)`);
