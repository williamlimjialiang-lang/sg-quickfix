(function () {
  var form = document.getElementById('supplier-form');
  if (!form) return;

  var $ = function (id) { return document.getElementById(id); };
  var MAX_LOGO = 2 * 1024 * 1024;
  var logoUrl = null;

  function setError(id, message, input) {
    var node = $(id + '-error');
    if (node) {
      node.textContent = message || '';
      node.hidden = !message;
    }
    var target = input || $(id);
    if (target && target.matches && target.matches('input, textarea, select')) {
      if (message) target.setAttribute('aria-invalid', 'true');
      else target.removeAttribute('aria-invalid');
    }
  }

  function checked(name) {
    return Array.prototype.slice.call(form.querySelectorAll('input[name="' + name + '"]:checked'))
      .map(function (i) { return i.value; });
  }

  function formatSize(bytes) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /* Normalise a Singapore number to 8 digits, or return null. */
  function sgNumber(value) {
    var digits = String(value || '').replace(/[^\d]/g, '');
    if (digits.length === 10 && digits.indexOf('65') === 0) digits = digits.slice(2);
    return /^[3689]\d{7}$/.test(digits) ? digits : null;
  }

  /* Business (ROB), local company (ROC) and other-entity UEN formats. */
  function validUen(value) {
    var v = String(value || '').toUpperCase().replace(/\s+/g, '');
    return /^(\d{8}[A-Z]|\d{9}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z])$/.test(v);
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  function validUrl(value) {
    try {
      var u = new URL(value);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch (e) { return false; }
  }

  /* Licence fields appear only for the trades that need them. */
  function syncLicences() {
    var services = checked('services');
    $('ema-field').hidden = services.indexOf('Electrical') === -1;
    $('pub-field').hidden = services.indexOf('Plumbing') === -1;
    if ($('ema-field').hidden) setError('ema_licence', '');
    if ($('pub-field').hidden) setError('pub_licence', '');
  }

  form.querySelectorAll('input[name="services"]').forEach(function (i) {
    i.addEventListener('change', function () {
      syncLicences();
      if (checked('services').length) setError('services', '');
    });
  });

  form.querySelectorAll('input[name="areas"]').forEach(function (i) {
    i.addEventListener('change', function () {
      if (checked('areas').length) setError('areas', '');
    });
  });

  var tagline = $('tagline');
  tagline.addEventListener('input', function () {
    $('tagline-count').textContent = String(tagline.value.length);
  });

  /* Logo */
  var logo = $('logo');
  function clearLogo() {
    logo.value = '';
    if (logoUrl) { URL.revokeObjectURL(logoUrl); logoUrl = null; }
    $('logo-empty').hidden = false;
    $('logo-preview').hidden = true;
  }

  logo.addEventListener('change', function () {
    setError('logo', '');
    var file = logo.files && logo.files[0];
    if (!file) { clearLogo(); return; }
    if (file.size > MAX_LOGO) {
      clearLogo();
      setError('logo', 'This file is ' + formatSize(file.size) + '. Choose one under 2 MB.');
      return;
    }
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    logoUrl = URL.createObjectURL(file);
    $('logo-img').src = logoUrl;
    $('logo-name').textContent = file.name;
    $('logo-size').textContent = formatSize(file.size);
    $('logo-empty').hidden = true;
    $('logo-preview').hidden = false;
  });

  $('logo-remove').addEventListener('click', function () {
    clearLogo();
    logo.focus();
  });

  /* Clear a field's error as soon as it's fixed. */
  form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], textarea').forEach(function (input) {
    input.addEventListener('input', function () {
      if (input.getAttribute('aria-invalid') === 'true') setError(input.id, '');
    });
  });

  ['confirm_accurate', 'consent_contact'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      if ($('confirm_accurate').checked && $('consent_contact').checked) setError('consents', '');
    });
  });

  function validate() {
    var errors = [];
    function fail(id, message, focusTarget) {
      setError(id, message);
      errors.push(focusTarget || $(id));
    }

    ['business_name', 'uen', 'contact_name', 'mobile', 'email', 'website', 'ema_licence', 'pub_licence', 'from_price', 'tagline']
      .forEach(function (id) { setError(id, ''); });
    ['services', 'areas', 'consents'].forEach(function (id) { setError(id, ''); });

    var name = $('business_name').value.trim();
    if (!name) fail('business_name', 'Enter your business name.');

    var uen = $('uen').value.trim();
    if (!uen) fail('uen', 'Enter your UEN.');
    else if (!validUen(uen)) fail('uen', 'Check your UEN. It looks like 53312345A or 201912345K.');

    if (!$('contact_name').value.trim()) fail('contact_name', 'Enter your name.');

    var mobile = $('mobile').value.trim();
    if (!mobile) fail('mobile', 'Enter the number homeowners should WhatsApp.');
    else if (!sgNumber(mobile)) fail('mobile', 'Enter an 8-digit Singapore number, like 9123 4567.');

    var email = $('email').value.trim();
    if (!email) fail('email', 'Enter your email address.');
    else if (!validEmail(email)) fail('email', 'Enter a valid email address, like name@business.sg.');

    var website = $('website').value.trim();
    if (website && !validUrl(website)) fail('website', 'Enter the full link, starting with https://');

    var services = checked('services');
    if (!services.length) fail('services', 'Choose at least one service.', form.querySelector('input[name="services"]'));

    if (services.indexOf('Electrical') !== -1 && !$('ema_licence').value.trim()) {
      fail('ema_licence', 'Enter your EMA licence number to list electrical work.');
    }
    if (services.indexOf('Plumbing') !== -1 && !$('pub_licence').value.trim()) {
      fail('pub_licence', 'Enter your PUB licence number to list plumbing work.');
    }

    if (!checked('areas').length) fail('areas', 'Choose the areas you cover.', form.querySelector('input[name="areas"]'));

    var price = $('from_price').value.trim();
    if (price && !(Number(price) >= 1 && Number(price) <= 99999)) fail('from_price', 'Enter a price in whole dollars.');

    if (!tagline.value.trim()) fail('tagline', 'Add one line about your business.');

    if (!$('confirm_accurate').checked || !$('consent_contact').checked) {
      fail('consents', 'Tick both boxes to send your application.', $('confirm_accurate'));
    }

    return errors;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setError('submit', '');

    var errors = validate();
    if (errors.length) {
      errors[0].focus();
      return;
    }

    // Tidy values before they're stored.
    $('uen').value = $('uen').value.toUpperCase().replace(/\s+/g, '');
    $('mobile').value = sgNumber($('mobile').value);

    var btn = $('apply-btn');
    btn.disabled = true;
    btn.textContent = 'Sending\u2026';

    fetch('/', { method: 'POST', body: new FormData(form) })
      .then(function (res) {
        if (!res.ok) throw new Error('Status ' + res.status);
        if (window.qfTrack) {
          var listing = form.querySelector('input[name="listing_type"]:checked');
          window.qfTrack('supplier_submit', { listing: listing ? listing.value.toLowerCase() : 'standard' });
        }
        $('done-email').textContent = $('email').value.trim();
        form.hidden = true;
        $('apply-done').hidden = false;
        $('apply-done').querySelector('h2').focus();
        $('apply-card').scrollIntoView({ block: 'start' });
      })
      .catch(function () {
        setError('submit', 'Your application didn\u2019t send. Check your connection and try again.');
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = 'Send application';
      });
  });

  syncLicences();
})();
