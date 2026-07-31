/* @ds-bundle: {"format":4,"namespace":"SuperbDesignSystem_467bc2","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Logo","sourcePath":"components/core/Logo.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"ProgressBar","sourcePath":"components/feedback/ProgressBar.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/feedback/Tooltip.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"bc9adfe81bb4","components/core/Button.jsx":"bde41e06d710","components/core/Card.jsx":"db7ae5c33dad","components/core/Icon.jsx":"c66b515062dc","components/core/IconButton.jsx":"3346bc318ec8","components/core/Logo.jsx":"404fcff8d98c","components/core/Tag.jsx":"c143727acc89","components/feedback/Dialog.jsx":"dd6dae19c0fd","components/feedback/ProgressBar.jsx":"8756860dd385","components/feedback/Toast.jsx":"c4fbc01dd4a3","components/feedback/Tooltip.jsx":"9594a36e9022","components/forms/Checkbox.jsx":"cdb9d4e164fb","components/forms/Input.jsx":"07711029788a","components/forms/Radio.jsx":"3ce598c49f3d","components/forms/Select.jsx":"85a44bd42aaf","components/forms/Switch.jsx":"6be1532f1d95","components/navigation/Tabs.jsx":"71e11ab653dc","ui_kits/app/AppShell.jsx":"4e4786987659","ui_kits/app/ReaderScreen.jsx":"0ab5f8cebc6d","ui_kits/app/TodayScreen.jsx":"c85ee34f3da4","ui_kits/app/WordBankScreen.jsx":"601b3b8a17fc","ui_kits/app/YouScreen.jsx":"2a818148d4ed","ui_kits/app/data.js":"8cd4a5b69c67","ui_kits/web/BentoGrid.jsx":"74a6c7a9a73c","ui_kits/web/Hero.jsx":"720eb30833fa","ui_kits/web/HowItWorks.jsx":"4045872c8e69","ui_kits/web/LibraryStrip.jsx":"e44d1270e00a","ui_kits/web/MissionBand.jsx":"9e4683ef9dd3","ui_kits/web/PricingSection.jsx":"82eff3d01919","ui_kits/web/SiteFooter.jsx":"4cc21c832744","ui_kits/web/SiteHeader.jsx":"341d52f88e6a"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.SuperbDesignSystem_467bc2 = window.SuperbDesignSystem_467bc2 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card({
  tone = 'card',
  pad = 'md',
  radius = 'md',
  interactive = false,
  onClick,
  children,
  style,
  ...rest
}) {
  const [hov, setHov] = React.useState(false);
  const bg = {
    card: 'var(--surface-card)',
    raised: 'var(--surface-raised)',
    sunken: 'var(--surface-sunken)',
    brand: 'var(--brand-soft)',
    inverse: 'var(--surface-inverse)'
  }[tone];
  return /*#__PURE__*/React.createElement("div", _extends({
    onClick: onClick,
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
    style: {
      background: bg,
      color: tone === 'inverse' ? 'var(--text-inverse)' : 'var(--text-1)',
      border: 'var(--bw-hairline) solid var(--border-1)',
      borderRadius: {
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)'
      }[radius],
      padding: {
        none: 0,
        sm: 'var(--card-pad-sm)',
        md: 'var(--card-pad)',
        lg: 'var(--sp-9)'
      }[pad],
      boxShadow: interactive && hov ? 'var(--shadow-2)' : tone === 'sunken' ? 'none' : 'var(--shadow-1)',
      transform: interactive && hov ? 'translateY(var(--lift))' : 'none',
      cursor: interactive ? 'pointer' : 'default',
      transition: 'box-shadow var(--dur-2) var(--ease-out),transform var(--dur-2) var(--ease-out)',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Superb has no proprietary glyph set. Iconography is Lucide (24px grid, 2px
   stroke, round caps), fetched from CDN and inlined so the glyph inherits
   currentColor and survives static capture. Fetched once per name, then cached. */
const CDN = 'https://cdn.jsdelivr.net/npm/lucide-static@0.525.0/icons/';
const CACHE = new Map();
function Icon({
  name = 'book-open',
  size = 20,
  color = 'currentColor',
  title,
  style,
  ...rest
}) {
  const [svg, setSvg] = React.useState(() => CACHE.get(name) || null);
  React.useEffect(() => {
    if (CACHE.has(name)) {
      setSvg(CACHE.get(name));
      return;
    }
    let live = true;
    fetch(CDN + name + '.svg').then(r => r.ok ? r.text() : '').then(t => {
      CACHE.set(name, t);
      if (live) setSvg(t);
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [name]);
  const markup = svg ? svg.replace('<svg', '<svg style="width:100%;height:100%;display:block"') : null;
  return /*#__PURE__*/React.createElement("span", _extends({
    role: title ? 'img' : undefined,
    "aria-label": title,
    "aria-hidden": title ? undefined : 'true',
    style: {
      display: 'inline-flex',
      flex: '0 0 auto',
      width: size,
      height: size,
      color,
      ...style
    },
    dangerouslySetInnerHTML: markup ? {
      __html: markup
    } : undefined
  }, rest));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Badge({
  tone = 'neutral',
  icon,
  children,
  style,
  ...rest
}) {
  const t = {
    neutral: {
      bg: 'var(--surface-sunken)',
      fg: 'var(--text-2)'
    },
    brand: {
      bg: 'var(--brand)',
      fg: 'var(--text-on-brand)'
    },
    support: {
      bg: 'var(--support-soft)',
      fg: 'var(--support)'
    },
    inverse: {
      bg: 'var(--surface-inverse)',
      fg: 'var(--text-inverse)'
    },
    success: {
      bg: 'var(--support-soft)',
      fg: 'var(--status-success)'
    },
    warn: {
      bg: '#F3E7CE',
      fg: '#7A5514'
    },
    danger: {
      bg: 'var(--brand-soft)',
      fg: 'var(--status-danger)'
    }
  }[tone];
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--sp-2)',
      padding: '4px 8px',
      background: t.bg,
      color: t.fg,
      font: 'var(--fw-semibold) var(--fs-200)/1 var(--font-ui)',
      letterSpacing: 'var(--ls-label)',
      textTransform: 'uppercase',
      borderRadius: 'var(--r-xs)',
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 11
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const H = {
  sm: 'var(--control-h-sm)',
  md: 'var(--control-h)',
  lg: 'var(--control-h-lg)'
};
const PAD = {
  sm: '0 12px',
  md: '0 16px',
  lg: '0 22px'
};
const FS = {
  sm: 'var(--fs-400)',
  md: 'var(--fs-500)',
  lg: 'var(--fs-600)'
};
const IC = {
  sm: 16,
  md: 18,
  lg: 20
};
function Button({
  variant = 'primary',
  size = 'md',
  iconStart,
  iconEnd,
  fullWidth = false,
  disabled = false,
  href,
  onClick,
  children,
  style,
  ...rest
}) {
  const [hov, setHov] = React.useState(false);
  const [act, setAct] = React.useState(false);
  const skin = {
    primary: {
      bg: act ? 'var(--brand-press)' : hov ? 'var(--brand-hover)' : 'var(--brand)',
      fg: 'var(--text-on-brand)',
      bd: 'transparent',
      sh: 'var(--shadow-1)'
    },
    secondary: {
      bg: hov ? 'var(--surface-sunken)' : 'var(--surface-card)',
      fg: 'var(--text-1)',
      bd: 'var(--border-2)',
      sh: 'var(--shadow-1)'
    },
    ghost: {
      bg: hov ? 'var(--brand-soft)' : 'transparent',
      fg: 'var(--brand)',
      bd: 'transparent',
      sh: 'none'
    },
    quiet: {
      bg: hov ? 'var(--surface-sunken)' : 'transparent',
      fg: 'var(--text-2)',
      bd: 'transparent',
      sh: 'none'
    },
    danger: {
      bg: act ? '#6E2424' : hov ? '#7C2A2A' : 'var(--status-danger)',
      fg: '#FFF7F2',
      bd: 'transparent',
      sh: 'var(--shadow-1)'
    }
  }[variant];
  const Tag = href ? 'a' : 'button';
  return /*#__PURE__*/React.createElement(Tag, _extends({
    href: href,
    onClick: disabled ? undefined : onClick,
    disabled: Tag === 'button' ? disabled : undefined,
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => {
      setHov(false);
      setAct(false);
    },
    onMouseDown: () => setAct(true),
    onMouseUp: () => setAct(false),
    style: {
      display: fullWidth ? 'flex' : 'inline-flex',
      width: fullWidth ? '100%' : undefined,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--sp-4)',
      height: H[size],
      minHeight: H[size],
      padding: PAD[size],
      font: 'var(--fw-semibold) ' + FS[size] + '/1 var(--font-ui)',
      letterSpacing: '.01em',
      whiteSpace: 'nowrap',
      color: skin.fg,
      background: skin.bg,
      textDecoration: 'none',
      border: 'var(--bw-hairline) solid ' + skin.bd,
      borderRadius: 'var(--r-sm)',
      boxShadow: skin.sh,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .42 : 1,
      transform: act && !disabled ? 'scale(var(--press-scale))' : 'none',
      transition: 'background var(--dur-1) var(--ease-out),transform var(--dur-1) var(--ease-out),color var(--dur-1) var(--ease-out)',
      ...style
    }
  }, rest), iconStart && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconStart,
    size: IC[size]
  }), children, iconEnd && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconEnd,
    size: IC[size]
  }));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const IB_SIZE = {
  sm: 32,
  md: 40,
  lg: 48
};
const IB_ICON = {
  sm: 16,
  md: 20,
  lg: 24
};
function IconButton({
  icon = 'x',
  label,
  variant = 'quiet',
  size = 'md',
  shape = 'rounded',
  disabled = false,
  onClick,
  style,
  ...rest
}) {
  const [hov, setHov] = React.useState(false);
  const [act, setAct] = React.useState(false);
  const skin = {
    primary: {
      bg: act ? 'var(--brand-press)' : hov ? 'var(--brand-hover)' : 'var(--brand)',
      fg: 'var(--text-on-brand)',
      bd: 'transparent'
    },
    secondary: {
      bg: hov ? 'var(--surface-sunken)' : 'var(--surface-card)',
      fg: 'var(--text-1)',
      bd: 'var(--border-2)'
    },
    quiet: {
      bg: hov ? 'var(--surface-sunken)' : 'transparent',
      fg: 'var(--text-2)',
      bd: 'transparent'
    }
  }[variant];
  return /*#__PURE__*/React.createElement("button", _extends({
    "aria-label": label,
    title: label,
    onClick: disabled ? undefined : onClick,
    disabled: disabled,
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => {
      setHov(false);
      setAct(false);
    },
    onMouseDown: () => setAct(true),
    onMouseUp: () => setAct(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: IB_SIZE[size],
      height: IB_SIZE[size],
      padding: 0,
      color: skin.fg,
      background: skin.bg,
      border: 'var(--bw-hairline) solid ' + skin.bd,
      borderRadius: shape === 'circle' ? 'var(--r-pill)' : 'var(--r-sm)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .42 : 1,
      transform: act && !disabled ? 'scale(var(--press-scale))' : 'none',
      transition: 'background var(--dur-1) var(--ease-out),transform var(--dur-1) var(--ease-out)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: IB_ICON[size]
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Logo.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* The Superb lockup: "Superb" set in Shantell Sans Bold with the three-stroke
   mark rotated -33 degrees about its lower-left corner.

   Geometry is the lockup specimen (guidelines/brand-lockup.card.html) expressed
   as ratios of the wordmark size, so every rendering — header, footer, app icon,
   thumbnail — lines up with the specimen exactly. At a 54px wordmark the
   specimen places the mark at left 7 / top -38 / 48 x 93. */
const LOCKUP = {
  left: 0.1296,
  top: -0.7037,
  w: 0.8889,
  h: 1.7222,
  rotate: -33
};
const MARK = 'M2 7 C18 4 34 8 50 5';
const CARET = 'M53 21 C55 15 58 9 60.5 4 C63 9 65.5 15 68 21';
const MARK2 = 'M71 5 C86 8 102 4 118 6';
function Logo({
  size = 48,
  tone = 'ink',
  mark = true,
  wordmark = true,
  style,
  ...rest
}) {
  const ink = tone === 'cream' ? 'var(--text-inverse)' : tone === 'mono' ? 'currentColor' : 'var(--text-1)';
  const accent = tone === 'mono' ? 'currentColor' : 'var(--brand)';
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      lineHeight: 1,
      ...style
    }
  }, rest), wordmark && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-bold)',
      fontSize: size,
      lineHeight: 'var(--lh-tight)',
      letterSpacing: 'var(--ls-display)',
      color: ink
    }
  }, "Superb"), mark && /*#__PURE__*/React.createElement("svg", {
    viewBox: "-2 1 124 23",
    fill: "none",
    strokeLinecap: "round",
    "aria-hidden": "true",
    style: wordmark ? {
      position: 'absolute',
      left: size * LOCKUP.left,
      top: size * LOCKUP.top,
      width: size * LOCKUP.w,
      height: size * LOCKUP.h,
      transform: `rotate(${LOCKUP.rotate}deg)`,
      transformOrigin: '0 100%',
      overflow: 'visible'
    } : {
      width: size * 1.6,
      overflow: 'visible'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: MARK,
    stroke: ink,
    strokeWidth: "3.4"
  }), /*#__PURE__*/React.createElement("path", {
    d: CARET,
    stroke: accent,
    strokeWidth: "3.8"
  }), /*#__PURE__*/React.createElement("path", {
    d: MARK2,
    stroke: ink,
    strokeWidth: "3.4"
  })));
}
Object.assign(__ds_scope, { Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Logo.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Tag({
  selected = false,
  onClick,
  onRemove,
  icon,
  children,
  style,
  ...rest
}) {
  const [hov, setHov] = React.useState(false);
  return /*#__PURE__*/React.createElement("span", _extends({
    onClick: onClick,
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--sp-3)',
      height: 28,
      padding: '0 10px',
      borderRadius: 'var(--r-pill)',
      background: selected ? 'var(--brand)' : hov && onClick ? 'var(--surface-sunken)' : 'transparent',
      color: selected ? 'var(--text-on-brand)' : 'var(--text-2)',
      border: 'var(--bw-hairline) solid ' + (selected ? 'transparent' : 'var(--border-2)'),
      font: 'var(--fw-medium) var(--fs-400)/1 var(--font-ui)',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'background var(--dur-1) var(--ease-out),color var(--dur-1) var(--ease-out)',
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 14
  }), children, onRemove && /*#__PURE__*/React.createElement("span", {
    onClick: e => {
      e.stopPropagation();
      onRemove(e);
    },
    style: {
      display: 'inline-flex',
      cursor: 'pointer',
      opacity: .6
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 13
  })));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Dialog({
  open = true,
  title,
  description,
  footer,
  variant = 'modal',
  onClose,
  children,
  style,
  ...rest
}) {
  if (!open) return null;
  const sheet = variant === 'sheet';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 60,
      display: 'flex',
      alignItems: sheet ? 'flex-end' : 'center',
      justifyContent: 'center',
      background: 'var(--scrim)',
      backdropFilter: 'var(--blur-sheet)',
      WebkitBackdropFilter: 'var(--blur-sheet)'
    },
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", _extends({
    role: "dialog",
    "aria-modal": "true",
    onClick: e => e.stopPropagation(),
    style: {
      width: sheet ? '100%' : 'min(440px,calc(100% - 32px))',
      background: 'var(--surface-card)',
      color: 'var(--text-1)',
      border: 'var(--bw-hairline) solid var(--border-1)',
      borderRadius: sheet ? 'var(--r-xl) var(--r-xl) 0 0' : 'var(--r-lg)',
      boxShadow: 'var(--shadow-3)',
      padding: 'var(--sp-8)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-6)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--sp-5)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-3)'
    }
  }, title && /*#__PURE__*/React.createElement("h3", {
    style: {
      font: 'var(--type-title-2)',
      color: 'var(--text-1)'
    }
  }, title), description && /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-body)',
      color: 'var(--text-2)',
      textWrap: 'pretty'
    }
  }, description)), onClose && /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "x",
    label: "Close",
    size: "sm",
    onClick: onClose
  })), children, footer && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 'var(--sp-4)'
    }
  }, footer)));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/ProgressBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ProgressBar({
  value = 0,
  max = 100,
  size = 'md',
  tone = 'brand',
  label,
  valueLabel,
  style,
  ...rest
}) {
  const pct = Math.max(0, Math.min(100, value / max * 100));
  const h = {
    sm: 4,
    md: 8,
    lg: 12
  }[size];
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-3)',
      ...style
    }
  }, rest), (label || valueLabel) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 'var(--sp-4)'
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-label)',
      color: 'var(--text-2)'
    }
  }, label), valueLabel && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, valueLabel)), /*#__PURE__*/React.createElement("div", {
    role: "progressbar",
    "aria-valuenow": value,
    "aria-valuemax": max,
    style: {
      height: h,
      borderRadius: 'var(--r-pill)',
      background: 'var(--surface-sunken)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: pct + '%',
      height: '100%',
      borderRadius: 'var(--r-pill)',
      background: tone === 'support' ? 'var(--support)' : 'var(--brand)',
      transition: 'width var(--dur-3) var(--ease-out)'
    }
  })));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Toast({
  tone = 'neutral',
  icon,
  title,
  message,
  action,
  onAction,
  onDismiss,
  style,
  ...rest
}) {
  const fg = {
    neutral: 'var(--text-inverse)',
    success: 'var(--text-inverse)',
    danger: '#FFF7F2'
  }[tone];
  const bg = {
    neutral: 'var(--surface-inverse)',
    success: 'var(--status-success)',
    danger: 'var(--status-danger)'
  }[tone];
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "status",
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--sp-5)',
      maxWidth: 420,
      padding: 'var(--sp-5) var(--sp-5) var(--sp-5) var(--sp-6)',
      background: bg,
      color: fg,
      borderRadius: 'var(--r-md)',
      boxShadow: 'var(--shadow-3)',
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 18,
    style: {
      marginTop: 2
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, title && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--fw-semibold) var(--fs-500)/1.3 var(--font-ui)'
    }
  }, title), message && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body-sm)',
      opacity: .82
    }
  }, message)), action && /*#__PURE__*/React.createElement("button", {
    onClick: onAction,
    style: {
      border: 'none',
      background: 'transparent',
      padding: '2px 4px',
      font: 'var(--fw-semibold) var(--fs-400)/1 var(--font-ui)',
      color: 'inherit',
      textDecoration: 'underline',
      cursor: 'pointer'
    }
  }, action), onDismiss && /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "x",
    label: "Dismiss",
    size: "sm",
    onClick: onDismiss,
    style: {
      color: 'inherit',
      marginTop: -2
    }
  }));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tooltip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Tooltip({
  content,
  placement = 'top',
  children,
  style,
  ...rest
}) {
  const [open, setOpen] = React.useState(false);
  const pos = {
    top: {
      bottom: 'calc(100% + 8px)',
      left: '50%',
      transform: 'translateX(-50%)'
    },
    bottom: {
      top: 'calc(100% + 8px)',
      left: '50%',
      transform: 'translateX(-50%)'
    },
    left: {
      right: 'calc(100% + 8px)',
      top: '50%',
      transform: 'translateY(-50%)'
    },
    right: {
      left: 'calc(100% + 8px)',
      top: '50%',
      transform: 'translateY(-50%)'
    }
  }[placement];
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      position: 'relative',
      display: 'inline-flex',
      ...style
    },
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false)
  }, rest), children, /*#__PURE__*/React.createElement("span", {
    role: "tooltip",
    style: {
      position: 'absolute',
      zIndex: 40,
      ...pos,
      padding: '6px 9px',
      maxWidth: 240,
      whiteSpace: 'nowrap',
      background: 'var(--surface-inverse)',
      color: 'var(--text-inverse)',
      font: 'var(--type-caption)',
      borderRadius: 'var(--r-xs)',
      boxShadow: 'var(--shadow-2)',
      opacity: open ? 1 : 0,
      pointerEvents: 'none',
      transition: 'opacity var(--dur-1) var(--ease-out)'
    }
  }, content));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Checkbox({
  label,
  description,
  checked = false,
  disabled = false,
  onChange,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: 'flex',
      alignItems: description ? 'flex-start' : 'center',
      gap: 'var(--sp-5)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: '0 0 auto',
      width: 20,
      height: 20,
      marginTop: description ? 2 : 0,
      background: checked ? 'var(--brand)' : 'var(--surface-card)',
      border: 'var(--bw-hairline) solid ' + (checked ? 'transparent' : 'var(--border-strong)'),
      borderRadius: 'var(--r-xs)',
      transition: 'background var(--dur-1) var(--ease-out)'
    }
  }, checked && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 14,
    color: "var(--text-on-brand)"
  })), /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: checked,
    disabled: disabled,
    onChange: onChange,
    style: {
      position: 'absolute',
      opacity: 0,
      width: 0,
      height: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body)',
      color: 'var(--text-1)'
    }
  }, label), description && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, description)));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  label,
  hint,
  error,
  iconStart,
  size = 'md',
  value,
  placeholder,
  type = 'text',
  disabled = false,
  onChange,
  style,
  ...rest
}) {
  const [foc, setFoc] = React.useState(false);
  const h = size === 'sm' ? 'var(--control-h-sm)' : size === 'lg' ? 'var(--control-h-lg)' : 'var(--control-h)';
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-3)',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-label)',
      color: 'var(--text-2)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--sp-4)',
      height: h,
      padding: '0 12px',
      background: disabled ? 'var(--surface-sunken)' : 'var(--surface-card)',
      border: 'var(--bw-hairline) solid ' + (error ? 'var(--status-danger)' : foc ? 'var(--brand)' : 'var(--border-2)'),
      borderRadius: 'var(--r-sm)',
      boxShadow: foc ? '0 0 0 3px var(--highlight)' : 'none',
      transition: 'border-color var(--dur-1) var(--ease-out),box-shadow var(--dur-1) var(--ease-out)'
    }
  }, iconStart && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconStart,
    size: 16,
    color: "var(--text-3)"
  }), /*#__PURE__*/React.createElement("input", _extends({
    type: type,
    value: value,
    placeholder: placeholder,
    disabled: disabled,
    onChange: onChange,
    onFocus: () => setFoc(true),
    onBlur: () => setFoc(false),
    style: {
      flex: 1,
      minWidth: 0,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      font: 'var(--type-body)',
      color: 'var(--text-1)'
    }
  }, rest))), (error || hint) && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: error ? 'var(--status-danger)' : 'var(--text-3)'
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Radio({
  label,
  description,
  checked = false,
  disabled = false,
  name,
  value,
  onChange,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: 'flex',
      alignItems: description ? 'flex-start' : 'center',
      gap: 'var(--sp-5)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: '0 0 auto',
      width: 20,
      height: 20,
      marginTop: description ? 2 : 0,
      borderRadius: 'var(--r-pill)',
      background: 'var(--surface-card)',
      border: 'var(--bw-strong) solid ' + (checked ? 'var(--brand)' : 'var(--border-strong)'),
      transition: 'border-color var(--dur-1) var(--ease-out)'
    }
  }, checked && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: 'var(--r-pill)',
      background: 'var(--brand)'
    }
  })), /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: name,
    value: value,
    checked: checked,
    disabled: disabled,
    onChange: onChange,
    style: {
      position: 'absolute',
      opacity: 0,
      width: 0,
      height: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body)',
      color: 'var(--text-1)'
    }
  }, label), description && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, description)));
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Select({
  label,
  hint,
  options = [],
  value,
  size = 'md',
  disabled = false,
  onChange,
  style,
  ...rest
}) {
  const [foc, setFoc] = React.useState(false);
  const h = size === 'sm' ? 'var(--control-h-sm)' : size === 'lg' ? 'var(--control-h-lg)' : 'var(--control-h)';
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-3)',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-label)',
      color: 'var(--text-2)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      height: h,
      background: disabled ? 'var(--surface-sunken)' : 'var(--surface-card)',
      border: 'var(--bw-hairline) solid ' + (foc ? 'var(--brand)' : 'var(--border-2)'),
      borderRadius: 'var(--r-sm)',
      boxShadow: foc ? '0 0 0 3px var(--highlight)' : 'none',
      transition: 'border-color var(--dur-1) var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    value: value,
    disabled: disabled,
    onChange: onChange,
    onFocus: () => setFoc(true),
    onBlur: () => setFoc(false),
    style: {
      appearance: 'none',
      WebkitAppearance: 'none',
      flex: 1,
      height: '100%',
      padding: '0 34px 0 12px',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      font: 'var(--type-body)',
      color: 'var(--text-1)',
      cursor: disabled ? 'not-allowed' : 'pointer'
    }
  }, rest), options.map(o => {
    const v = typeof o === 'string' ? o : o.value,
      l = typeof o === 'string' ? o : o.label;
    return /*#__PURE__*/React.createElement("option", {
      key: v,
      value: v
    }, l);
  })), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 16,
    color: "var(--text-3)",
    style: {
      position: 'absolute',
      right: 11,
      pointerEvents: 'none'
    }
  })), hint && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, hint));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Switch({
  label,
  description,
  checked = false,
  disabled = false,
  onChange,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--sp-6)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body)',
      color: 'var(--text-1)'
    }
  }, label), description && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, description)), /*#__PURE__*/React.createElement("span", {
    onClick: disabled ? undefined : onChange,
    style: {
      position: 'relative',
      flex: '0 0 auto',
      width: 44,
      height: 26,
      borderRadius: 'var(--r-pill)',
      background: checked ? 'var(--brand)' : 'var(--border-2)',
      transition: 'background var(--dur-2) var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 3,
      left: checked ? 21 : 3,
      width: 20,
      height: 20,
      borderRadius: 'var(--r-pill)',
      background: 'var(--surface-raised)',
      boxShadow: 'var(--shadow-1)',
      transition: 'left var(--dur-2) var(--ease-spring)'
    }
  })));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Tabs({
  items = [],
  value,
  variant = 'underline',
  onChange,
  style,
  ...rest
}) {
  const [hov, setHov] = React.useState(null);
  const seg = variant === 'segmented';
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "tablist",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: seg ? 'var(--sp-1)' : 'var(--sp-7)',
      padding: seg ? '3px' : 0,
      background: seg ? 'var(--surface-sunken)' : 'transparent',
      borderRadius: seg ? 'var(--r-sm)' : 0,
      borderBottom: seg ? 'none' : 'var(--bw-hairline) solid var(--border-1)',
      ...style
    }
  }, rest), items.map(it => {
    const v = typeof it === 'string' ? it : it.value,
      l = typeof it === 'string' ? it : it.label;
    const on = v === value;
    return /*#__PURE__*/React.createElement("button", {
      key: v,
      role: "tab",
      "aria-selected": on,
      onClick: () => onChange && onChange(v),
      onMouseEnter: () => setHov(v),
      onMouseLeave: () => setHov(null),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-4)',
        padding: seg ? '0 12px' : '0 0 10px',
        height: seg ? 30 : 'auto',
        border: 'none',
        background: seg && on ? 'var(--surface-card)' : 'transparent',
        borderRadius: seg ? 'var(--r-xs)' : 0,
        boxShadow: seg && on ? 'var(--shadow-1)' : 'none',
        borderBottom: seg ? 'none' : 'var(--bw-strong) solid ' + (on ? 'var(--brand)' : 'transparent'),
        marginBottom: seg ? 0 : -1,
        font: (on ? 'var(--fw-semibold)' : 'var(--fw-regular)') + ' var(--fs-500)/1 var(--font-ui)',
        color: on ? 'var(--text-1)' : hov === v ? 'var(--text-1)' : 'var(--text-3)',
        cursor: 'pointer',
        transition: 'color var(--dur-1) var(--ease-out)'
      }
    }, it.icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: it.icon,
      size: 16
    }), l, it.count != null && /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-caption)',
        color: 'var(--text-3)'
      }
    }, it.count));
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/AppShell.jsx
try { (() => {
const {
  Icon,
  Logo
} = window.SuperbDesignSystem_467bc2;

/* Device frame + status bar + bottom tab bar. Cosmetic only. */
function PhoneFrame({
  theme,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    "data-theme": theme,
    style: {
      position: 'relative',
      width: 390,
      height: 760,
      flex: '0 0 auto',
      background: 'var(--surface-page)',
      color: 'var(--text-1)',
      borderRadius: 'var(--r-2xl)',
      border: '10px solid var(--ox-ink-deep)',
      boxShadow: 'var(--shadow-3)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(StatusBar, null), children);
}
function StatusBar() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 22px 4px',
      font: 'var(--fw-semibold) var(--fs-300)/1 var(--font-ui)',
      color: 'var(--text-1)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "9:41"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      gap: 5,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "signal",
    size: 13
  }), /*#__PURE__*/React.createElement(Icon, {
    name: "wifi",
    size: 13
  }), /*#__PURE__*/React.createElement(Icon, {
    name: "battery-full",
    size: 15
  })));
}
function TabBar({
  tab,
  onChange
}) {
  const items = [['today', 'Today', 'sun'], ['read', 'Read', 'book-open'], ['bank', 'Words', 'bookmark'], ['you', 'You', 'flame']];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'stretch',
      gap: 2,
      padding: '6px 10px 14px',
      background: 'var(--surface-card)',
      borderTop: 'var(--bw-hairline) solid var(--border-1)'
    }
  }, items.map(([v, label, icon]) => {
    const on = v === tab;
    return /*#__PURE__*/React.createElement("button", {
      key: v,
      onClick: () => onChange(v),
      style: {
        flex: 1,
        minHeight: 'var(--tap-min)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: on ? 'var(--brand)' : 'var(--text-3)',
        transition: 'color var(--dur-1) var(--ease-out)'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: icon,
      size: 20
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        font: (on ? 'var(--fw-semibold)' : 'var(--fw-regular)') + ' var(--fs-200)/1 var(--font-ui)'
      }
    }, label));
  }));
}
function ScreenHeader({
  title,
  subtitle,
  right,
  brand
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      padding: '10px 20px 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, brand ? /*#__PURE__*/React.createElement(Logo, {
    size: 22
  }) : /*#__PURE__*/React.createElement("h2", {
    style: {
      font: 'var(--type-title-1)',
      color: 'var(--text-1)'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, subtitle)), right);
}
function Scroll({
  children
}) {
  // flex:'0 0 auto' on every child so long screens scroll instead of squashing.
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      overflowY: 'auto',
      padding: '0 20px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, React.Children.map(children, (c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: '0 0 auto'
    }
  }, c)));
}
Object.assign(window, {
  PhoneFrame,
  StatusBar,
  TabBar,
  ScreenHeader,
  Scroll
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/AppShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/ReaderScreen.jsx
try { (() => {
const {
  IconButton,
  Button,
  Badge,
  Tabs,
  Dialog,
  Tag,
  ProgressBar
} = window.SuperbDesignSystem_467bc2;
function Word({
  children,
  state,
  onClick
}) {
  const bg = state === 'known' ? 'var(--support-soft)' : state ? 'var(--highlight)' : 'transparent';
  return /*#__PURE__*/React.createElement("span", {
    onClick: onClick,
    style: {
      background: bg,
      borderRadius: 'var(--r-xs)',
      padding: '0 3px',
      cursor: 'pointer',
      transition: 'background var(--dur-1) var(--ease-out)'
    }
  }, children);
}
function ReaderScreen({
  onBack,
  kept,
  onKeep
}) {
  const d = window.SB_DATA;
  const [open, setOpen] = React.useState(null);
  const [tab, setTab] = React.useState('Definition');
  const byWord = Object.fromEntries(d.words.map(w => [w.word, w]));
  const render = (para, pi) => {
    const parts = para.split('|');
    return /*#__PURE__*/React.createElement("p", {
      key: pi,
      style: {
        font: 'var(--type-passage)',
        color: 'var(--text-1)',
        margin: 0,
        textWrap: 'pretty'
      }
    }, parts.map((p, i) => i % 2 === 0 ? p : /*#__PURE__*/React.createElement(Word, {
      key: i,
      state: kept.includes(p) ? 'known' : byWord[p] ? 'new' : null,
      onClick: () => {
        setTab('Definition');
        setOpen(byWord[p]);
      }
    }, p)));
  };
  const w = open;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 12px 10px'
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "chevron-left",
    label: "Back",
    onClick: onBack
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--fw-semibold) var(--fs-400)/1.2 var(--font-ui)',
      color: 'var(--text-1)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, d.passage.title), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, "page ", d.passage.page, " of ", d.passage.pages)), /*#__PURE__*/React.createElement(IconButton, {
    icon: "volume-2",
    label: "Read aloud"
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "type",
    label: "Text settings"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 20px'
    }
  }, /*#__PURE__*/React.createElement(ProgressBar, {
    value: d.passage.page,
    max: d.passage.pages,
    size: "sm"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '20px 22px 28px',
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, d.passage.paragraphs.map(render), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      paddingTop: 6
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "support",
    icon: "check"
  }, kept.length, " kept here"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, "tap any highlighted word"))), w && /*#__PURE__*/React.createElement(Dialog, {
    variant: "sheet",
    onClose: () => setOpen(null)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      marginTop: -6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 'var(--fs-900)',
      lineHeight: 1.05,
      color: 'var(--text-1)'
    }
  }, w.word), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, w.phon, " \xB7 ", w.pos, " \xB7 ", w.band)), /*#__PURE__*/React.createElement(IconButton, {
    icon: "volume-2",
    label: "Hear it",
    variant: "secondary",
    shape: "circle"
  })), /*#__PURE__*/React.createElement(Tabs, {
    variant: "segmented",
    items: ['Definition', 'In context', 'Roots'],
    value: tab,
    onChange: setTab
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-body)',
      color: 'var(--text-2)',
      margin: 0,
      minHeight: 44,
      textWrap: 'pretty'
    }
  }, tab === 'Definition' ? w.def : tab === 'In context' ? '“' + w.ctx + '”' : w.roots), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    style: {
      flex: 1
    },
    onClick: () => setOpen(null)
  }, "I know it"), /*#__PURE__*/React.createElement(Button, {
    iconStart: "bookmark",
    style: {
      flex: 1
    },
    onClick: () => {
      onKeep(w.word);
      setOpen(null);
    }
  }, "Keep the word")))));
}
Object.assign(window, {
  ReaderScreen,
  Word
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/ReaderScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/TodayScreen.jsx
try { (() => {
const {
  Card,
  Button,
  Badge,
  ProgressBar,
  Tag,
  Icon
} = window.SuperbDesignSystem_467bc2;
function TodayScreen({
  onRead,
  onOpenWord
}) {
  const d = window.SB_DATA;
  const due = d.words.filter(w => w.state !== 'known').slice(0, 3);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ScreenHeader, {
    brand: true,
    subtitle: "Tuesday \xB7 6 minutes left today",
    right: /*#__PURE__*/React.createElement(Badge, {
      tone: "brand",
      icon: "flame"
    }, "Day 41")
  }), /*#__PURE__*/React.createElement(Scroll, null, /*#__PURE__*/React.createElement(Card, {
    pad: "none",
    radius: "md",
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--brand)',
      padding: '22px 20px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-eyebrow)',
      letterSpacing: 'var(--ls-eyebrow)',
      textTransform: 'uppercase',
      color: 'var(--text-on-brand)',
      opacity: .7
    }
  }, "Today\u2019s passage"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-title-1)',
      color: 'var(--text-on-brand)'
    }
  }, d.passage.title), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body-sm)',
      color: 'var(--text-on-brand)',
      opacity: .78
    }
  }, d.passage.author, " \xB7 ", d.passage.collection)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 20px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(ProgressBar, {
    value: d.passage.page,
    max: d.passage.pages,
    valueLabel: d.passage.page + ' of ' + d.passage.pages + ' pages'
  }), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    iconStart: "book-open",
    fullWidth: true,
    onClick: onRead
  }, "Keep reading"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      font: 'var(--type-title-3)',
      fontFamily: 'var(--font-ui)',
      color: 'var(--text-1)'
    }
  }, "Due for review"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, due.length, " words")), due.map(w => /*#__PURE__*/React.createElement(Card, {
    key: w.word,
    interactive: true,
    pad: "sm",
    onClick: () => onOpenWord(w),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--fw-semibold) var(--fs-500)/1.2 var(--font-ui)',
      color: 'var(--text-1)'
    }
  }, w.word), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, w.pos, " \xB7 ", w.band)), w.state === 'new' ? /*#__PURE__*/React.createElement(Badge, {
    tone: "brand"
  }, "New") : /*#__PURE__*/React.createElement(Badge, null, w.progress, "%"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 16,
    color: "var(--text-3)"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginTop: 4
    }
  }, [['1,284', 'words kept'], ['41', 'day streak'], ['18h', 'read']].map(s => /*#__PURE__*/React.createElement(Card, {
    key: s[1],
    tone: "sunken",
    pad: "sm",
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 'var(--fs-700)',
      color: 'var(--text-1)'
    }
  }, s[0]), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, s[1])))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      font: 'var(--type-title-3)',
      fontFamily: 'var(--font-ui)',
      color: 'var(--text-1)'
    }
  }, "Pick something else"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, d.library.map(l => /*#__PURE__*/React.createElement(Tag, {
    key: l.title,
    onClick: () => {}
  }, l.title, " \xB7 ", l.count))))));
}
Object.assign(window, {
  TodayScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/TodayScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/WordBankScreen.jsx
try { (() => {
const {
  Input,
  Tabs,
  Card,
  Badge,
  Tag,
  ProgressBar,
  Icon
} = window.SuperbDesignSystem_467bc2;
function WordBankScreen({
  onOpenWord
}) {
  const d = window.SB_DATA;
  const [tab, setTab] = React.useState('new');
  const [q, setQ] = React.useState('');
  const counts = {
    new: d.words.filter(w => w.state === 'new').length,
    learning: d.words.filter(w => w.state === 'learning').length,
    known: d.words.filter(w => w.state === 'known').length
  };
  const list = d.words.filter(w => w.state === tab && w.word.includes(q.toLowerCase()));
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ScreenHeader, {
    title: "Word bank",
    subtitle: "1,284 words kept since April"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 20px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Input, {
    iconStart: "search",
    placeholder: "obstreperous",
    value: q,
    onChange: e => setQ(e.target.value)
  }), /*#__PURE__*/React.createElement(Tabs, {
    value: tab,
    onChange: setTab,
    items: [{
      value: 'new',
      label: 'New',
      count: counts.new
    }, {
      value: 'learning',
      label: 'Learning',
      count: counts.learning
    }, {
      value: 'known',
      label: 'Known',
      count: counts.known
    }]
  })), /*#__PURE__*/React.createElement(Scroll, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Tag, {
    selected: true,
    onClick: () => {}
  }, "All sources"), /*#__PURE__*/React.createElement(Tag, {
    onClick: () => {}
  }, "Essays"), /*#__PURE__*/React.createElement(Tag, {
    onClick: () => {}
  }, "Letters")), list.map(w => /*#__PURE__*/React.createElement(Card, {
    key: w.word,
    interactive: true,
    pad: "sm",
    onClick: () => onOpenWord(w),
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      font: 'var(--fw-semibold) var(--fs-500)/1.2 var(--font-ui)',
      color: 'var(--text-1)'
    }
  }, w.word), w.state === 'known' ? /*#__PURE__*/React.createElement(Badge, {
    tone: "support",
    icon: "check"
  }, "Mastered") : w.state === 'new' ? /*#__PURE__*/React.createElement(Badge, {
    tone: "brand"
  }, "New") : /*#__PURE__*/React.createElement(Badge, null, w.progress, "%"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 16,
    color: "var(--text-3)"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body-sm)',
      color: 'var(--text-2)'
    }
  }, w.def), w.state === 'learning' && /*#__PURE__*/React.createElement(ProgressBar, {
    value: w.progress,
    size: "sm"
  }))), !list.length && /*#__PURE__*/React.createElement(Card, {
    tone: "sunken",
    pad: "sm"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body-sm)',
      color: 'var(--text-3)'
    }
  }, "Nothing here yet. Read something and tap a word."))));
}
Object.assign(window, {
  WordBankScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/WordBankScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/YouScreen.jsx
try { (() => {
const {
  Card,
  Badge,
  Switch,
  Button,
  ProgressBar,
  Icon
} = window.SuperbDesignSystem_467bc2;
function YouScreen({
  theme,
  onTheme
}) {
  const [aloud, setAloud] = React.useState(true);
  const [nudge, setNudge] = React.useState(true);
  const themes = [['oxblood', 'Oxblood', '#9B3B3B'], ['lilac', 'Lilac Ink', '#7B52C9'], ['glacier', 'Glacier', '#0E8FA8'], ['oxblood-dark', 'Night', '#201813']];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ScreenHeader, {
    title: "You",
    subtitle: "ada.lovelace@post.co"
  }), /*#__PURE__*/React.createElement(Scroll, null, /*#__PURE__*/React.createElement(Card, {
    tone: "inverse",
    pad: "md",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "flame",
    size: 22
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 'var(--fs-800)'
    }
  }, "41 days"), /*#__PURE__*/React.createElement(Badge, {
    tone: "brand"
  }, "Best yet")), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body-sm)',
      opacity: .78
    }
  }, "Six minutes today keeps it alive."), /*#__PURE__*/React.createElement(ProgressBar, {
    value: 68,
    tone: "support",
    size: "sm"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, [['18h', 'time read'], ['1,284', 'words kept'], ['92%', 'recall']].map(s => /*#__PURE__*/React.createElement(Card, {
    key: s[1],
    pad: "sm",
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 'var(--fs-600)',
      color: 'var(--text-1)'
    }
  }, s[0]), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, s[1])))), /*#__PURE__*/React.createElement("h3", {
    style: {
      font: 'var(--type-title-3)',
      fontFamily: 'var(--font-ui)',
      color: 'var(--text-1)',
      marginTop: 4
    }
  }, "Paper"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, themes.map(([v, label, dot]) => /*#__PURE__*/React.createElement("button", {
    key: v,
    onClick: () => onTheme(v),
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      padding: '10px 4px',
      background: 'var(--surface-card)',
      cursor: 'pointer',
      border: 'var(--bw-hairline) solid ' + (theme === v ? 'var(--brand)' : 'var(--border-1)'),
      borderRadius: 'var(--r-sm)',
      boxShadow: theme === v ? 'var(--shadow-1)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 22,
      height: 22,
      borderRadius: 'var(--r-xs)',
      background: dot
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--fw-medium) var(--fs-200)/1 var(--font-ui)',
      color: 'var(--text-2)'
    }
  }, label)))), /*#__PURE__*/React.createElement(Card, {
    pad: "md",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement(Switch, {
    label: "Read aloud",
    description: "Highlights each word as it speaks.",
    checked: aloud,
    onChange: () => setAloud(!aloud)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--border-1)'
    }
  }), /*#__PURE__*/React.createElement(Switch, {
    label: "Nudge me at 8pm",
    description: "Only if you haven\u2019t read yet.",
    checked: nudge,
    onChange: () => setNudge(!nudge)
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "quiet",
    iconStart: "log-out",
    style: {
      alignSelf: 'flex-start'
    }
  }, "Sign out")));
}
Object.assign(window, {
  YouScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/YouScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/data.js
try { (() => {
// Sample content for the Superb app kit. All passages are original text written
// for this kit — swap in real licensed or public-domain material before shipping.
window.SB_DATA = {
  passage: {
    title: 'On the Habit of Walking',
    author: 'Beatrice Hale',
    collection: 'Essays, 1908',
    page: 12,
    pages: 30,
    paragraphs: ['She had an |obstreperous| manner of arriving, as though the room had been waiting for her and had waited badly. Coats were shed, chairs were moved, and the afternoon rearranged itself around her.', 'What I liked, and what I have never been able to explain to anyone who did not already understand it, was the |candour| of the streets at that hour — every window lit, every conversation half audible, the whole city |ostensibly| private and entirely open.', 'To walk without an errand was thought |indolent| then. I walked anyway, and found that the habit paid me in sentences.']
  },
  words: [{
    word: 'obstreperous',
    pos: 'adjective',
    phon: '/ ob-STREP-er-uhs /',
    band: 'C1',
    def: 'Noisy and difficult to control.',
    ctx: 'She had an obstreperous manner of arriving.',
    roots: 'Latin obstrepere — to make a noise against.',
    state: 'new'
  }, {
    word: 'candour',
    pos: 'noun',
    phon: '/ KAN-der /',
    band: 'B2',
    def: 'The quality of being open and honest.',
    ctx: 'the candour of the streets at that hour',
    roots: 'Latin candor — brightness, whiteness.',
    state: 'learning',
    progress: 60
  }, {
    word: 'ostensibly',
    pos: 'adverb',
    phon: '/ o-STEN-sib-lee /',
    band: 'C1',
    def: 'Apparently, but perhaps not actually.',
    ctx: 'the whole city ostensibly private',
    roots: 'Latin ostendere — to show.',
    state: 'learning',
    progress: 35
  }, {
    word: 'indolent',
    pos: 'adjective',
    phon: '/ IN-duh-luhnt /',
    band: 'C1',
    def: 'Wanting to avoid activity or effort.',
    ctx: 'To walk without an errand was thought indolent.',
    roots: 'Latin indolentem — free from pain.',
    state: 'new'
  }, {
    word: 'specious',
    pos: 'adjective',
    phon: '/ SPEE-shuhs /',
    band: 'C2',
    def: 'Superficially plausible, but wrong.',
    ctx: 'The argument was specious but the delivery impeccable.',
    roots: 'Latin speciosus — fair of appearance.',
    state: 'known'
  }, {
    word: 'impeccable',
    pos: 'adjective',
    phon: '/ im-PEK-uh-buhl /',
    band: 'B2',
    def: 'In accordance with the highest standards.',
    ctx: 'the delivery was impeccable',
    roots: 'Latin impeccabilis — not liable to sin.',
    state: 'known'
  }, {
    word: 'laconic',
    pos: 'adjective',
    phon: '/ luh-KON-ik /',
    band: 'C1',
    def: 'Using very few words.',
    ctx: 'a laconic reply, three words long',
    roots: 'Greek Lakonikos — of Sparta.',
    state: 'known'
  }],
  library: [{
    title: 'Short essays',
    count: 64,
    tone: 'brand'
  }, {
    title: 'Letters & diaries',
    count: 38,
    tone: 'support'
  }, {
    title: 'Nature writing',
    count: 21,
    tone: 'ink'
  }]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/data.js", error: String((e && e.message) || e) }); }

// ui_kits/web/BentoGrid.jsx
try { (() => {
const {
  Card
} = window.SuperbDesignSystem_467bc2;

/* Doodle tiles. Strokes use the mark's own language — 3.4 / 2.6 weight, round
   caps, no fill. Each tile runs a small sequence rather than a single draw:
   passages flowing, a word lifted into the bank, roots budding, a word
   returning on an orbit. */
const P = ({
  d,
  len,
  w = 3.4,
  c,
  delay = 0,
  dur = 5.6
}) => /*#__PURE__*/React.createElement("path", {
  className: "draw",
  d: d,
  fill: "none",
  stroke: c,
  strokeWidth: w,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  style: {
    '--len': len,
    animationDelay: `${delay}s`,
    animationDuration: `${dur}s`
  }
});
const Dot = ({
  cx,
  cy,
  r,
  c,
  delay = 0,
  dur = 5.6
}) => /*#__PURE__*/React.createElement("circle", {
  className: "anim",
  cx: cx,
  cy: cy,
  r: r,
  fill: c,
  stroke: "none",
  style: {
    animation: `mk-pop ${dur}s ease-in-out ${delay}s infinite backwards`,
    transformOrigin: `${cx}px ${cy}px`
  }
});
const Doodle = ({
  box,
  h,
  clip,
  children
}) => /*#__PURE__*/React.createElement("svg", {
  className: "mk-doodle",
  viewBox: box,
  fill: "none",
  "aria-hidden": "true",
  style: {
    width: '100%',
    height: h,
    overflow: clip ? 'hidden' : 'visible',
    display: 'block'
  }
}, children);
function BentoGrid() {
  const t1 = 'var(--mk-1)',
    t2 = 'var(--mk-2)',
    t3 = 'var(--mk-3)',
    t4 = 'var(--mk-4)';
  const Tile = ({
    span,
    rows,
    tone,
    doodleH,
    clip,
    art,
    title,
    body
  }) => /*#__PURE__*/React.createElement(Card, {
    interactive: true,
    pad: "lg",
    radius: "lg",
    style: {
      gridColumn: `span ${span}`,
      gridRow: rows ? `span ${rows}` : 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-6)',
      overflow: 'hidden',
      background: `color-mix(in oklab,${tone} 7%,var(--surface-card))`,
      border: 'var(--bw-hairline) solid transparent',
      boxShadow: `inset 0 0 0 1px color-mix(in oklab,${tone} 22%,transparent)`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: doodleH,
      paddingBottom: 'var(--sp-4)'
    }
  }, /*#__PURE__*/React.createElement(Doodle, {
    box: art.box,
    h: rows ? '100%' : doodleH,
    clip: clip
  }, art.paths)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-4)'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    className: "mk-h3",
    style: {
      fontSize: 'var(--fs-600)'
    }
  }, title), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-body-sm)',
      color: 'var(--text-2)',
      margin: 0,
      maxWidth: '44ch',
      textWrap: 'pretty'
    }
  }, body)));

  /* A — passages flowing up through a tall stack, over a drawn waveform. The
     viewBox is authored tall so it fills the 2x2 slot instead of letterboxing. */
  const Page = ({
    delay
  }) => /*#__PURE__*/React.createElement("g", {
    className: "anim",
    style: {
      animation: `mk-flow 5.4s cubic-bezier(.4,0,.5,1) ${delay}s infinite backwards`
    }
  }, /*#__PURE__*/React.createElement("rect", {
    x: "62",
    y: "150",
    width: "116",
    height: "34",
    rx: "9",
    fill: "none",
    stroke: t1,
    strokeWidth: "2.6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M78 167 H150",
    fill: "none",
    stroke: t1,
    strokeWidth: "2.6",
    strokeLinecap: "round",
    opacity: ".55"
  }));
  return /*#__PURE__*/React.createElement("section", {
    className: "mk-sec",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-5)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "What\u2019s inside"), /*#__PURE__*/React.createElement("h2", {
    className: "mk-h2",
    style: {
      maxWidth: '20ch'
    }
  }, "Everything a reader needs, ", /*#__PURE__*/React.createElement("span", {
    className: "mk-accent",
    style: {
      color: 'var(--mk-4)'
    }
  }, "nothing"), " a student dreads.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 'var(--sp-7)',
      gridAutoRows: 'minmax(214px,auto)'
    }
  }, /*#__PURE__*/React.createElement(Tile, {
    span: 2,
    rows: 2,
    tone: t1,
    doodleH: 168,
    clip: true,
    title: "A library worth finishing",
    body: "Essays, letters, nature writing and journalism \u2014 short enough to finish, voiced by a human reader, and pitched at the level you actually read. Bring your own articles and epubs too.",
    art: {
      box: '0 0 240 300',
      paths: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Page, {
        delay: 0
      }), /*#__PURE__*/React.createElement(Page, {
        delay: 1.8
      }), /*#__PURE__*/React.createElement(Page, {
        delay: 3.6
      }), /*#__PURE__*/React.createElement(P, {
        d: "M90 240 H150 A14 14 0 0 1 164 254 V266 A14 14 0 0 1 150 280 H120 L104 292 L106 280 H90 A14 14 0 0 1 76 266 V254 A14 14 0 0 1 90 240 Z",
        len: 296,
        w: 2.6,
        c: t1,
        delay: .4,
        dur: 5.4
      }), /*#__PURE__*/React.createElement(Dot, {
        cx: 100,
        cy: 260,
        r: 4,
        c: t1,
        delay: 1.5,
        dur: 5.4
      }), /*#__PURE__*/React.createElement(Dot, {
        cx: 120,
        cy: 260,
        r: 4,
        c: t1,
        delay: 1.68,
        dur: 5.4
      }), /*#__PURE__*/React.createElement(Dot, {
        cx: 140,
        cy: 260,
        r: 4,
        c: t1,
        delay: 1.86,
        dur: 5.4
      }))
    }
  }), /*#__PURE__*/React.createElement(Tile, {
    span: 2,
    tone: t2,
    doodleH: 104,
    title: "A word bank that fills itself",
    body: "Tap once and it\u2019s kept \u2014 dated, defined, and tied to the sentence you met it in. No deck to build, nothing to file.",
    art: {
      box: '0 0 240 88',
      paths: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(P, {
        d: "M14 20 H150",
        len: 136,
        w: 2.6,
        c: t2
      }), /*#__PURE__*/React.createElement(P, {
        d: "M14 42 H112",
        len: 98,
        w: 2.6,
        c: t2,
        delay: .22
      }), /*#__PURE__*/React.createElement(P, {
        d: "M14 64 H158",
        len: 144,
        w: 2.6,
        c: t2,
        delay: .44
      }), /*#__PURE__*/React.createElement("g", {
        className: "anim",
        style: {
          animation: 'mk-travel 5.6s cubic-bezier(.5,0,.4,1) infinite backwards',
          transformOrigin: '88px 42px'
        }
      }, /*#__PURE__*/React.createElement("rect", {
        x: "62",
        y: "31",
        width: "52",
        height: "22",
        rx: "7",
        fill: `color-mix(in oklab,${t2} 26%,transparent)`,
        stroke: t2,
        strokeWidth: "2.4"
      })), /*#__PURE__*/React.createElement(P, {
        d: "M176 52 H226 V80 H176 Z",
        len: 156,
        w: 2.6,
        c: t2,
        delay: 1.3
      }))
    }
  }), /*#__PURE__*/React.createElement(Tile, {
    span: 1,
    tone: t3,
    doodleH: 124,
    title: "Roots included",
    body: "Etymology, pronunciation, and the family a word travels with.",
    art: {
      box: '0 0 130 116',
      paths: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(P, {
        d: "M65 25 V69",
        len: 44,
        c: t3
      }), /*#__PURE__*/React.createElement(P, {
        d: "M65 69 C50 77 40 88 36 101",
        len: 50,
        w: 2.6,
        c: t3,
        delay: .32
      }), /*#__PURE__*/React.createElement(P, {
        d: "M65 69 C80 77 90 88 94 101",
        len: 50,
        w: 2.6,
        c: t3,
        delay: .52
      }), /*#__PURE__*/React.createElement(Dot, {
        cx: 65,
        cy: 20,
        r: 5,
        c: t3,
        delay: .1
      }), /*#__PURE__*/React.createElement(Dot, {
        cx: 36,
        cy: 101,
        r: 4,
        c: t3,
        delay: 1.0
      }), /*#__PURE__*/React.createElement(Dot, {
        cx: 94,
        cy: 101,
        r: 4,
        c: t3,
        delay: 1.2
      }))
    }
  }), /*#__PURE__*/React.createElement(Tile, {
    span: 1,
    tone: t4,
    doodleH: 124,
    title: "It comes back",
    body: "Kept words resurface inside new passages \u2014 recognition first, never flashcards.",
    art: {
      box: '0 0 130 116',
      paths: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(P, {
        d: "M65 20 A38 38 0 1 1 64.9 20",
        len: 239,
        w: 2.6,
        c: t4
      }), /*#__PURE__*/React.createElement("g", {
        className: "anim",
        style: {
          animation: 'mk-orbit 6s linear infinite backwards',
          transformOrigin: '65px 58px'
        }
      }, /*#__PURE__*/React.createElement("circle", {
        cx: "65",
        cy: "20",
        r: "6",
        fill: t4,
        stroke: "none"
      })), /*#__PURE__*/React.createElement("g", {
        className: "anim",
        style: {
          animation: 'mk-breathe 3s ease-in-out infinite backwards',
          transformOrigin: '65px 56px'
        }
      }, /*#__PURE__*/React.createElement("path", {
        d: "M52 71 C56 61 61 49 65 41 C69 49 74 61 78 71",
        fill: "none",
        stroke: t4,
        strokeWidth: "3.4",
        strokeLinecap: "round"
      })))
    }
  })));
}
Object.assign(window, {
  BentoGrid
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/BentoGrid.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/Hero.jsx
try { (() => {
const {
  Button,
  Card,
  ProgressBar,
  Icon
} = window.SuperbDesignSystem_467bc2;

/* Hero concept: an annotated page. Shantell Sans finally earns its keep as the
   reader's own handwriting in the margin; the passage is live — tap a marked
   word and its card swaps.

   Colour carries meaning here: a kept word travels the whole marketing spectrum
   from coral (just met) through violet and teal to sage (nearly yours), so every
   hue in the system is doing a job rather than decorating. */
const TONE = ['var(--mk-1)', 'var(--mk-2)', 'var(--mk-3)', 'var(--mk-4)', 'var(--mk-5)'];
const toneFor = seen => TONE[Math.min(TONE.length - 1, Math.max(0, seen - 1))];
const WORDS = {
  obstreperous: {
    say: 'ob-STREP-er-uhs',
    pos: 'adjective',
    def: 'Noisy and difficult to control.',
    seen: 1
  },
  languid: {
    say: 'LANG-gwid',
    pos: 'adjective',
    def: 'Slow and relaxed; moving without energy.',
    seen: 3
  },
  reticent: {
    say: 'RET-i-suhnt',
    pos: 'adjective',
    def: 'Reluctant to say what you feel.',
    seen: 4
  }
};
const BANK = [['obstreperous', 1], ['languid', 3], ['reticent', 4], ['susurrus', 2], ['quotidian', 4], ['lacuna', 1], ['palimpsest', 3], ['verdant', 4], ['obdurate', 2], ['ineffable', 3], ['salient', 4], ['febrile', 1], ['recondite', 2], ['halcyon', 4]];
function Hero({
  onSignup
}) {
  const [word, setWord] = React.useState('obstreperous');
  const w = WORDS[word];
  const wc = toneFor(w.seen);
  const Mark = ({
    name
  }) => /*#__PURE__*/React.createElement("span", {
    className: "mk-word",
    "data-on": word === name ? '1' : '0',
    onClick: () => setWord(name),
    style: {
      '--wc': toneFor(WORDS[name].seen)
    }
  }, name);
  return /*#__PURE__*/React.createElement("section", {
    className: "mk-mesh",
    style: {
      position: 'relative',
      overflow: 'hidden',
      borderBottom: 'var(--bw-hairline) solid var(--border-1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.04fr)',
      gap: 'var(--sp-10)',
      alignItems: 'center',
      maxWidth: 'var(--shell-max)',
      margin: '0 auto',
      padding: 'var(--sp-12) var(--sp-10)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 'var(--sp-7)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Vocabulary, through reading"), /*#__PURE__*/React.createElement("h1", {
    className: "mk-h1"
  }, "Nobody ever learned", /*#__PURE__*/React.createElement("br", null), "a word from a", ' ', /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-block'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mk-accent"
  }, "list"), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 120 12",
    preserveAspectRatio: "none",
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      left: '-4%',
      bottom: -8,
      width: '108%',
      height: 14,
      overflow: 'visible'
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "mkUnder",
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "0"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "var(--mk-1)"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "30%",
    stopColor: "var(--mk-2)"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "62%",
    stopColor: "var(--mk-3)"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "var(--mk-4)"
  }))), /*#__PURE__*/React.createElement("path", {
    d: "M2 8 C30 2 62 11 118 4",
    fill: "none",
    stroke: "url(#mkUnder)",
    strokeWidth: "3.8",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 13 C34 8 66 15 116 9",
    fill: "none",
    stroke: "url(#mkUnder)",
    strokeWidth: "2.4",
    strokeLinecap: "round",
    opacity: ".55"
  }))), "."), /*#__PURE__*/React.createElement("p", {
    className: "mk-lede",
    style: {
      maxWidth: '42ch'
    }
  }, "Superb gives you something worth reading, then keeps every word you stumble on. Tap it once; it comes back until it\u2019s yours."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--sp-5)',
      alignItems: 'center',
      marginTop: 'var(--sp-2)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    iconStart: "book-open",
    onClick: onSignup
  }, "Start with six minutes"), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    variant: "quiet",
    iconEnd: "play"
  }, "See a passage")), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, "Free while you\u2019re building the habit. No streak guilt, no leaderboards.")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    pad: "none",
    radius: "lg",
    style: {
      overflow: 'visible',
      border: 'none',
      boxShadow: 'var(--shadow-3)',
      transform: 'rotate(-1.1deg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--sp-4)',
      padding: '13px 20px',
      borderBottom: 'var(--bw-hairline) solid var(--border-1)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "book-open",
    size: 14,
    color: "var(--text-3)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, "On the Habit of Walking \xB7 page 12 of 30"), /*#__PURE__*/React.createElement(Icon, {
    name: "volume-2",
    size: 14,
    color: "var(--text-3)"
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-read)',
      fontWeight: 'var(--fw-regular)',
      fontSize: 'var(--fs-500)',
      lineHeight: 'var(--lh-read)',
      color: 'var(--text-1)',
      margin: 0,
      textWrap: 'pretty',
      padding: 'var(--sp-8) var(--sp-8) var(--sp-9)'
    }
  }, "She had an ", /*#__PURE__*/React.createElement(Mark, {
    name: "obstreperous"
  }), " manner of arriving, as though the room had been waiting for her and had waited badly. Her brother followed, ", /*#__PURE__*/React.createElement(Mark, {
    name: "languid"
  }), " and", ' ', /*#__PURE__*/React.createElement(Mark, {
    name: "reticent"
  }), ", and sat where the light was worst.")), /*#__PURE__*/React.createElement("span", {
    className: "mk-hand",
    style: {
      position: 'absolute',
      top: -34,
      right: '12%',
      fontSize: 'var(--fs-600)',
      color: 'var(--mk-3)',
      transform: 'rotate(-6deg)',
      whiteSpace: 'nowrap'
    }
  }, "tap any word", /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 40 34",
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      right: -30,
      top: 14,
      width: 34,
      height: 30,
      overflow: 'visible'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 2 C22 6 30 16 26 28",
    fill: "none",
    stroke: "var(--mk-3)",
    strokeWidth: "2.4",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M19 24 L26 29 L27 20",
    fill: "none",
    stroke: "var(--mk-3)",
    strokeWidth: "2.4",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement(Card, {
    pad: "md",
    radius: "md",
    style: {
      position: 'relative',
      zIndex: 2,
      alignSelf: 'flex-start',
      width: '86%',
      marginTop: -22,
      marginLeft: '-6%',
      transform: 'rotate(1.4deg)',
      border: 'none',
      boxShadow: 'var(--shadow-3)',
      background: `color-mix(in oklab,${wc} 10%,var(--surface-raised))`,
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-4)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 'var(--sp-4)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-bold)',
      fontSize: 'var(--fs-700)',
      letterSpacing: '-.01em',
      color: wc
    }
  }, word), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, "/ ", w.say, " / ", w.pos)), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body-sm)',
      color: 'var(--text-2)'
    }
  }, w.def), /*#__PURE__*/React.createElement(ProgressBar, {
    value: w.seen,
    max: 5,
    size: "sm",
    valueLabel: w.seen === 1 ? 'seen once — four to go' : `seen ${w.seen} times — ${5 - w.seen} to go`
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--sp-4)',
      paddingTop: 'var(--sp-2)',
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "just met"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      height: 3,
      borderRadius: 'var(--r-pill)',
      background: 'var(--mk-spectrum)'
    }
  }), /*#__PURE__*/React.createElement("span", null, "nearly yours"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      overflow: 'hidden',
      borderTop: 'var(--bw-hairline) solid var(--border-1)',
      background: 'linear-gradient(90deg,color-mix(in oklab,var(--mk-1) 16%,transparent),color-mix(in oklab,var(--mk-2) 16%,transparent),color-mix(in oklab,var(--mk-3) 16%,transparent),color-mix(in oklab,var(--mk-4) 16%,transparent),color-mix(in oklab,var(--mk-5) 16%,transparent))',
      padding: 'var(--sp-6) 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mk-marquee"
  }, [0, 1].map(dup => /*#__PURE__*/React.createElement("div", {
    key: dup,
    "aria-hidden": dup === 1,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--sp-8)',
      paddingRight: 'var(--sp-8)'
    }
  }, BANK.map(([b, seen]) => /*#__PURE__*/React.createElement("span", {
    key: b,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--sp-4)',
      whiteSpace: 'nowrap',
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-bold)',
      fontSize: 'var(--fs-600)',
      color: toneFor(seen)
    }
  }, b, /*#__PURE__*/React.createElement(Icon, {
    name: "bookmark",
    size: 13,
    color: toneFor(seen)
  }))))))));
}
Object.assign(window, {
  Hero
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/Hero.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/HowItWorks.jsx
try { (() => {
const {
  Icon
} = window.SuperbDesignSystem_467bc2;
const STEPS = [{
  k: 'Read',
  icon: 'book-open',
  tone: 'var(--mk-1)',
  title: 'Six minutes of something good',
  body: 'Essays, letters, nature writing, journalism. Short enough to finish, good enough to finish twice.'
}, {
  k: 'Tap',
  icon: 'bookmark',
  tone: 'var(--mk-3)',
  title: 'Tap what trips you up',
  body: 'A word you half-know gets a definition, the sentence it came from, and its roots. One tap keeps it.'
}, {
  k: 'Keep',
  icon: 'repeat',
  tone: 'var(--mk-5)',
  title: 'It comes back until it’s yours',
  body: 'Kept words return inside new passages — never as flashcards. Recognition first, then recall.'
}];
function HowItWorks() {
  return /*#__PURE__*/React.createElement("section", {
    className: "mk-sec",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-11)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 'var(--sp-9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-5)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "How it works"), /*#__PURE__*/React.createElement("h2", {
    className: "mk-h2",
    style: {
      maxWidth: '18ch'
    }
  }, "Three moves, then the ", /*#__PURE__*/React.createElement("span", {
    className: "mk-accent",
    style: {
      color: 'var(--mk-3)'
    }
  }, "habit"), " does the work.")), /*#__PURE__*/React.createElement("span", {
    className: "mk-lede",
    style: {
      maxWidth: '34ch',
      fontSize: 'var(--fs-500)'
    }
  }, "No decks to build, no settings to tune. You read; the word bank fills itself.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 'var(--sp-10)'
    }
  }, STEPS.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.k,
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-6)',
      paddingTop: 'var(--sp-7)',
      borderTop: `var(--bw-strong) solid ${s.tone}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--sp-5)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 40,
      height: 40,
      borderRadius: 'var(--r-sm)',
      background: s.tone,
      color: '#FFFFFF'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: s.icon,
    size: 19
  })), /*#__PURE__*/React.createElement("span", {
    className: "mk-num",
    style: {
      fontSize: 'var(--fs-400)',
      color: s.tone,
      letterSpacing: 'var(--ls-label)'
    }
  }, "0", i + 1)), /*#__PURE__*/React.createElement("h3", {
    className: "mk-h3",
    style: {
      maxWidth: '16ch'
    }
  }, s.title), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-body-sm)',
      color: 'var(--text-2)',
      margin: 0,
      maxWidth: '34ch',
      textWrap: 'pretty'
    }
  }, s.body)))));
}
Object.assign(window, {
  HowItWorks
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/HowItWorks.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/LibraryStrip.jsx
try { (() => {
const {
  Card,
  Tabs,
  Badge,
  Icon
} = window.SuperbDesignSystem_467bc2;
function LibraryStrip() {
  const [filter, setFilter] = React.useState('All');
  const filters = ['All', 'Essays', 'Letters', 'Nature', 'Journalism'];
  const items = [{
    title: 'On the Habit of Walking',
    author: 'Beatrice Hale',
    mins: 6,
    band: 'C1',
    kind: 'Essays',
    tint: 'var(--mk-1)',
    ink: '#FFFFFF'
  }, {
    title: 'Letters from a Cold Spring',
    author: 'H. Merrick',
    mins: 4,
    band: 'B2',
    kind: 'Letters',
    tint: 'var(--mk-2)',
    ink: '#FFFFFF'
  }, {
    title: 'The Salt Marsh in August',
    author: 'J. Okonkwo',
    mins: 8,
    band: 'C1',
    kind: 'Nature',
    tint: 'var(--mk-3)',
    ink: '#FFFFFF'
  }, {
    title: 'What the Ledger Knew',
    author: 'A. Ferrante',
    mins: 5,
    band: 'C2',
    kind: 'Journalism',
    tint: 'var(--mk-4)',
    ink: '#FFFFFF'
  }];
  const shown = items.filter(i => filter === 'All' || i.kind === filter);
  return /*#__PURE__*/React.createElement("section", {
    className: "mk-sec",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-5)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "The library"), /*#__PURE__*/React.createElement("h2", {
    className: "mk-h2",
    style: {
      maxWidth: '20ch'
    }
  }, "Short, finishable, worth ", /*#__PURE__*/React.createElement("span", {
    className: "mk-accent",
    style: {
      color: 'var(--mk-3)'
    }
  }, "rereading"), ".")), /*#__PURE__*/React.createElement(Tabs, {
    variant: "underline",
    items: filters,
    value: filter,
    onChange: setFilter
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 'var(--sp-6)'
    }
  }, shown.map(i => /*#__PURE__*/React.createElement(Card, {
    key: i.title,
    interactive: true,
    pad: "none",
    radius: "lg",
    style: {
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height: 132,
      background: i.tint,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'flex-end',
      padding: 'var(--sp-5)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      right: -6,
      top: -34,
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-bold)',
      fontSize: 132,
      lineHeight: 1,
      color: i.ink,
      opacity: .3,
      pointerEvents: 'none'
    }
  }, i.title[0]), /*#__PURE__*/React.createElement(Badge, {
    tone: "inverse"
  }, i.band)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--sp-6)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-3)',
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 'var(--fw-semibold)',
      fontSize: 'var(--fs-500)',
      letterSpacing: '-.015em',
      lineHeight: 1.3,
      color: 'var(--text-1)'
    }
  }, i.title), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, i.author), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginTop: 'auto',
      paddingTop: 'var(--sp-5)',
      font: 'var(--type-caption)',
      color: 'var(--text-2)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 13
  }), i.mins, " min"))))), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, "Cover panels are solid spectrum colour standing in for artwork \u2014 no real cover art has been provided."));
}
Object.assign(window, {
  LibraryStrip
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/LibraryStrip.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/MissionBand.jsx
try { (() => {
function MissionBand() {
  const stats = [['54%', 'of US adults read below a sixth-grade level', 'var(--mk-1)'], ['6 min', 'a day is where the habit sticks', 'var(--mk-3)'], ['1,284', 'words the average reader keeps in a year', 'var(--mk-4)']];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      color: 'var(--text-inverse)',
      background: 'radial-gradient(64% 82% at 8% -6%,color-mix(in oklab,var(--mk-2) 78%,transparent) 0%,transparent 58%),radial-gradient(58% 76% at 96% 106%,color-mix(in oklab,var(--mk-3) 72%,transparent) 0%,transparent 60%),radial-gradient(40% 54% at 62% 10%,color-mix(in oklab,var(--mk-1) 34%,transparent) 0%,transparent 66%),#16131D'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--shell-max)',
      margin: '0 auto',
      padding: 'var(--sp-13) var(--sp-10)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-12)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    className: "mk-h2",
    style: {
      color: '#FFFFFF',
      maxWidth: '22ch'
    }
  }, "The literacy crisis isn\u2019t a vocabulary problem. It\u2019s a ", /*#__PURE__*/React.createElement("span", {
    className: "mk-accent",
    style: {
      color: 'var(--mk-4)'
    }
  }, "reading"), " problem."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 'var(--sp-10)'
    }
  }, stats.map(s => /*#__PURE__*/React.createElement("div", {
    key: s[0],
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-5)',
      paddingTop: 'var(--sp-6)',
      borderTop: `var(--bw-strong) solid ${s[2]}`
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mk-num",
    style: {
      fontSize: 'var(--fs-1200)',
      color: '#FFFFFF'
    }
  }, s[0]), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body-sm)',
      color: 'rgba(255,255,255,.76)',
      maxWidth: '26ch'
    }
  }, s[1])))), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-inverse)',
      opacity: .42
    }
  }, "Figures are placeholders for the kit \u2014 swap in cited sources before publishing.")));
}
Object.assign(window, {
  MissionBand
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/MissionBand.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/PricingSection.jsx
try { (() => {
const {
  Card,
  Button,
  Badge,
  Icon
} = window.SuperbDesignSystem_467bc2;
function PricingSection({
  onSignup
}) {
  const plans = [{
    name: 'Reader',
    price: 'Free',
    note: 'forever',
    lines: ['One passage a day', 'Unlimited kept words', 'Read aloud'],
    cta: 'Start reading',
    variant: 'secondary'
  }, {
    name: 'Reader+',
    price: '$6',
    note: 'a month',
    lines: ['The whole library', 'Import your own reading', 'Weekly recap', 'Family: four readers'],
    cta: 'Start with six minutes',
    variant: 'secondary',
    featured: true
  }];
  return /*#__PURE__*/React.createElement("section", {
    className: "mk-sec",
    style: {
      maxWidth: '960px',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-10)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-5)',
      alignItems: 'center',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Pricing"), /*#__PURE__*/React.createElement("h2", {
    className: "mk-h2",
    style: {
      maxWidth: '20ch'
    }
  }, "Cheaper than the book you ", /*#__PURE__*/React.createElement("span", {
    className: "mk-accent",
    style: {
      color: 'var(--mk-2)'
    }
  }, "didn\u2019t"), " finish.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'var(--sp-6)',
      alignItems: 'stretch'
    }
  }, plans.map(p => {
    const dark = p.featured;
    const ink = dark ? '#FFFFFF' : 'var(--text-1)';
    const mute = dark ? 'rgba(255,255,255,.82)' : 'var(--text-2)';
    return /*#__PURE__*/React.createElement(Card, {
      key: p.name,
      pad: "lg",
      radius: "lg",
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-7)',
        background: dark ? 'linear-gradient(142deg,var(--mk-2) 0%,var(--mk-3) 62%,var(--mk-4) 100%)' : 'var(--surface-card)',
        border: dark ? 'none' : 'var(--bw-hairline) solid var(--border-1)',
        boxShadow: dark ? 'var(--shadow-3)' : 'var(--shadow-1)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-4)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        font: 'var(--type-title-3)',
        color: ink
      }
    }, p.name), p.featured && /*#__PURE__*/React.createElement(Badge, {
      tone: "inverse"
    }, "Most read")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 'var(--sp-3)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "mk-num",
      style: {
        fontSize: 'var(--fs-1100)',
        color: ink
      }
    }, p.price), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-caption)',
        color: dark ? mute : 'var(--text-3)'
      }
    }, p.note)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-5)',
        flex: 1
      }
    }, p.lines.map(l => /*#__PURE__*/React.createElement("span", {
      key: l,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-4)',
        font: 'var(--type-body-sm)',
        color: mute
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "check",
      size: 15,
      color: dark ? '#FFFFFF' : 'var(--mk-3)'
    }), l))), /*#__PURE__*/React.createElement(Button, {
      variant: p.variant,
      fullWidth: true,
      onClick: onSignup
    }, p.cta));
  })));
}
Object.assign(window, {
  PricingSection
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/PricingSection.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/SiteFooter.jsx
try { (() => {
const {
  Logo,
  Input,
  Button,
  Icon
} = window.SuperbDesignSystem_467bc2;
function SiteFooter() {
  const cols = [['Product', ['The library', 'Read aloud', 'Word bank', 'iOS', 'Android']], ['Schools', ['For teachers', 'District pricing', 'Reading levels']], ['Company', ['Why we exist', 'Research', 'Press', 'Contact']]];
  return /*#__PURE__*/React.createElement("footer", {
    className: "mk-foot",
    style: {
      borderTop: 'var(--bw-hairline) solid var(--border-1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--shell-max)',
      margin: '0 auto',
      padding: 'var(--sp-11) var(--sp-10) var(--sp-8)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.5fr repeat(3,1fr)',
      gap: 'var(--sp-10)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-6)'
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    size: 24
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-body-sm)',
      color: 'var(--text-2)',
      margin: 0,
      maxWidth: '30ch'
    }
  }, "One good passage a week, and the words it teaches."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--sp-4)',
      alignItems: 'flex-end',
      maxWidth: 340
    }
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "you@post.co",
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary"
  }, "Subscribe"))), cols.map(([h, links]) => /*#__PURE__*/React.createElement("div", {
    key: h,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-5)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, h), links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#"
  }, l))))), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: 'var(--sp-11) 0 0',
      paddingTop: 'var(--sp-6)',
      borderTop: 'var(--bw-hairline) solid var(--border-1)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--sp-6)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      font: 'var(--type-caption)',
      color: 'var(--text-3)'
    }
  }, "\xA9 2026 Superb \xB7 Reading is the intervention."), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      gap: 'var(--sp-6)',
      color: 'var(--text-3)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "instagram",
    size: 16
  }), /*#__PURE__*/React.createElement(Icon, {
    name: "youtube",
    size: 16
  }), /*#__PURE__*/React.createElement(Icon, {
    name: "rss",
    size: 16
  })))));
}
Object.assign(window, {
  SiteFooter
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/SiteFooter.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/SiteHeader.jsx
try { (() => {
const {
  Logo,
  Button
} = window.SuperbDesignSystem_467bc2;
function SiteHeader({
  onSignup
}) {
  const links = ['Why reading', 'How it works', 'Schools', 'Pricing'];
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 30,
      background: 'color-mix(in oklab,var(--surface-page) 82%,transparent)',
      backdropFilter: 'var(--blur-sheet)',
      WebkitBackdropFilter: 'var(--blur-sheet)',
      borderBottom: 'var(--bw-hairline) solid var(--border-1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--shell-max)',
      margin: '0 auto',
      height: 64,
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--sp-9)',
      padding: '0 var(--sp-10)'
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    size: 24
  }), /*#__PURE__*/React.createElement("nav", {
    className: "mk-nav",
    style: {
      flex: 1,
      display: 'flex',
      gap: 'var(--sp-8)'
    }
  }, links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#"
  }, l))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--sp-5)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "quiet",
    size: "sm"
  }, "Sign in"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    iconEnd: "arrow-right",
    onClick: onSignup
  }, "Start reading"))));
}
Object.assign(window, {
  SiteHeader
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/SiteHeader.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
