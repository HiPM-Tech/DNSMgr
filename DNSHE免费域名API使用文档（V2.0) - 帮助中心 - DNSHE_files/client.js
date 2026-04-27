(function(){
  function parseQuery(){
    var query = {};
    var search = window.location.search || '';
    if (search.charAt(0) === '?') {
      search = search.substring(1);
    }
    if (!search) {
      return query;
    }
    search.split('&').forEach(function(pair){
      if (!pair) { return; }
      var parts = pair.split('=');
      var key = decodeURIComponent(parts[0] || '');
      if (!key) { return; }
      var value = decodeURIComponent(parts.slice(1).join('=') || '');
      query[key] = value;
    });
    return query;
  }

  function getCookie(name){
    var pattern = new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/+^])/g, '\\$1') + '=([^;]*)');
    var match = document.cookie.match(pattern);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function serialize(data){
    var parts = [];
    for (var key in data) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(data[key] == null ? '' : data[key]));
    }
    return parts.join('&');
  }

  var toastContainer = null;

  function ensureToastContainer(){
    if (toastContainer) {
      return toastContainer;
    }
    toastContainer = document.createElement('div');
    toastContainer.className = 'dr-toast-container';
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  function showToast(message, type){
    var container = ensureToastContainer();
    var toast = document.createElement('div');
    toast.className = 'dr-toast dr-toast--' + (type === 'success' ? 'success' : 'error');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function(){ toast.classList.add('dr-toast--show'); }, 20);
    setTimeout(function(){
      toast.classList.remove('dr-toast--show');
      setTimeout(function(){
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 200);
    }, 3200);
  }

  function showConfirm(title, message, confirmLabel, cancelLabel){
    return new Promise(function(resolve){
      var backdrop = document.createElement('div');
      backdrop.className = 'dr-modal-backdrop';

      var modal = document.createElement('div');
      modal.className = 'dr-modal';

      var heading = document.createElement('h4');
      heading.textContent = title;
      modal.appendChild(heading);

      var paragraph = document.createElement('p');
      paragraph.textContent = message;
      modal.appendChild(paragraph);

      var actions = document.createElement('div');
      actions.className = 'dr-modal-actions';

      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'dr-btn dr-btn--cancel';
      cancelBtn.textContent = cancelLabel;

      var confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'dr-btn dr-btn--confirm';
      confirmBtn.textContent = confirmLabel;

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      modal.appendChild(actions);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);

      function cleanup(){
        if (backdrop && backdrop.parentNode) {
          backdrop.parentNode.removeChild(backdrop);
        }
      }

      cancelBtn.addEventListener('click', function(){ cleanup(); resolve(false); });
      confirmBtn.addEventListener('click', function(){ cleanup(); resolve(true); });
      backdrop.addEventListener('click', function(evt){
        if (evt.target === backdrop) {
          cleanup(); resolve(false);
        }
      });
      document.addEventListener('keydown', function escHandler(evt){
        if (evt.key === 'Escape') {
          document.removeEventListener('keydown', escHandler);
          cleanup();
          resolve(false);
        }
      });
    });
  }

  function request(endpoint, payload){
    return new Promise(function(resolve, reject){
      var xhr = new XMLHttpRequest();
      xhr.open('POST', (window.WHMCSBasePath || '') + endpoint, true);
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
      xhr.onreadystatechange = function(){
        if (xhr.readyState !== 4) { return; }
        var text = xhr.responseText || '';
        try {
          var data = JSON.parse(text);
          resolve(data);
        } catch (err) {
          reject(new Error((window.DisableRenewalLang || {}).requestFailed || 'Request failed'));
        }
      };
      xhr.onerror = function(){
        reject(new Error((window.DisableRenewalLang || {}).requestFailed || 'Request failed'));
      };
      xhr.send(serialize(payload));
    });
  }

  function getLangValue(key, fallback){
    var lang = window.DisableRenewalLang || {};
    var value = lang[key];
    if (typeof value === 'string' && value.length) {
      return value;
    }
    return fallback;
  }

  function setLoadingState(element, loadingText){
    if (!element.getAttribute('data-original-text')) {
      element.setAttribute('data-original-text', element.textContent || '');
    }
    element.setAttribute('data-loading', '1');
    if (loadingText) {
      element.textContent = loadingText;
    }
  }

  function clearLoadingState(element){
    var original = element.getAttribute('data-original-text');
    if (original != null) {
      element.textContent = original;
    }
    element.removeAttribute('data-loading');
  }

  function getClosest(target, selector){
    if (!target) { return null; }
    if (target.closest) {
      return target.closest(selector);
    }
    while (target && target !== document) {
      if (matchesSelector(target, selector)) {
        return target;
      }
      target = target.parentNode;
    }
    return null;
  }

  function matchesSelector(element, selector){
    var proto = Element.prototype;
    var func = proto.matches || proto.msMatchesSelector || proto.webkitMatchesSelector;
    if (func) {
      return func.call(element, selector);
    }
    return false;
  }

  function getToken(element){
    return getCookie('disable_renewal_token') || (element ? element.getAttribute('data-token') : '') || '';
  }

  function shouldBlockActions(){
    var context = window.DisableRenewalContext || {};
    return !!context.statusHidden;
  }

  function formatConfirmMessage(template, fallback, nextDueDate){
    if (nextDueDate) {
      return template.replace('{date}', nextDueDate);
    }
    return fallback;
  }

  function refreshAfterDelay(){
    setTimeout(function(){ window.location.reload(); }, 1200);
  }

  document.addEventListener('click', function(event){
    var cancelEl = getClosest(event.target, '.cancel-renewal');
    if (cancelEl) {
      event.preventDefault();
      handleCancel(cancelEl);
      return;
    }
    var restoreEl = getClosest(event.target, '.restore-renewal');
    if (restoreEl) {
      event.preventDefault();
      handleRestore(restoreEl);
    }
  }, true);

  function handleCancel(element){
    if (shouldBlockActions()) {
      showToast(getLangValue('statusBlocked', 'This operation is not available.'), 'error');
      return;
    }
    if (element.getAttribute('data-loading') === '1') {
      return;
    }

    var query = parseQuery();
    var serviceId = element.getAttribute('data-serviceid') || query.id || '';
    if (!serviceId) {
      showToast(getLangValue('missingServiceId', 'Unable to determine service ID'), 'error');
      return;
    }

    var token = getToken(element);
    if (!token) {
      showToast(getLangValue('missingToken', 'Missing security token. Please refresh and try again.'), 'error');
      return;
    }

    showConfirm(
      getLangValue('cancelConfirmTitle', 'Confirm Disable Auto-Renewal'),
      getLangValue('cancelConfirmMessage', 'Are you sure you want to disable auto-renewal for this service?'),
      getLangValue('cancelConfirmButton', 'Confirm Disable'),
      getLangValue('cancelButton', 'Cancel')
    ).then(function(confirmed){
      if (!confirmed) {
        return;
      }

      setLoadingState(element, getLangValue('canceling', 'Processing…'));

      request('modules/addons/disable_renewal/cancel.php', {
        serviceid: serviceId,
        token: token
      }).then(function(response){
        if (response && response.status === 'success') {
          showToast(response.message || getLangValue('cancelSuccess', 'Auto-renewal disabled'), 'success');
          refreshAfterDelay();
        } else {
          var prefix = getLangValue('cancelFailedPrefix', 'Disable failed: ');
          var message = (response && response.message) ? response.message : getLangValue('unknownError', 'Request failed');
          showToast(prefix + message, 'error');
          clearLoadingState(element);
        }
      }).catch(function(error){
        showToast(error.message || getLangValue('requestFailed', 'Request failed'), 'error');
        clearLoadingState(element);
      });
    });
  }

  function handleRestore(element){
    if (shouldBlockActions()) {
      showToast(getLangValue('statusBlocked', 'This operation is not available.'), 'error');
      return;
    }
    if (element.getAttribute('data-loading') === '1') {
      return;
    }

    var query = parseQuery();
    var serviceId = element.getAttribute('data-serviceid') || query.id || '';
    if (!serviceId) {
      showToast(getLangValue('missingServiceId', 'Unable to determine service ID'), 'error');
      return;
    }

    var token = getToken(element);
    if (!token) {
      showToast(getLangValue('missingToken', 'Missing security token. Please refresh and try again.'), 'error');
      return;
    }

    setLoadingState(element, getLangValue('restoring', 'Processing…'));

    request('modules/addons/disable_renewal/restore.php', {
      serviceid: serviceId,
      token: token
    }).then(function(response){
      if (response && response.status === 'success') {
        showToast(response.message || getLangValue('restoreSuccess', 'Auto-renewal enabled'), 'success');
        refreshAfterDelay();
      } else {
        var prefix = getLangValue('opFailedPrefix', 'Operation failed: ');
        var message = (response && response.message) ? response.message : getLangValue('unknownError', 'Request failed');
        showToast(prefix + message, 'error');
        clearLoadingState(element);
      }
    }).catch(function(error){
      showToast(error.message || getLangValue('requestFailed', 'Request failed'), 'error');
      clearLoadingState(element);
    });
  }

  if (shouldBlockActions()) {
    var buttons = document.querySelectorAll('.cancel-renewal, .restore-renewal');
    Array.prototype.forEach.call(buttons, function(btn){
      btn.classList.add('disable-renewal-disabled');
    });
  }
})();
