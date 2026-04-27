    jQuery(function(){
    var cfg = window.USERNAME_PLUGIN || {};
    var fieldId = cfg.fieldId ? String(cfg.fieldId) : '';
    var isLoggedIn = cfg.isLoggedIn === 1 || cfg.isLoggedIn === '1';

    var defaults = {
        loginPlaceholder: '用户名或邮箱',
        loginError: '未找到该用户名对应的账户',
        registrationPlaceholder: '设置登录用户名',
        profileLabel: '用户名',
        profilePlaceholder: '用户名',
        profileHelp: '用户名设置后将锁定不可修改',
        validationMin: '最少 :min 个字符',
        validationMax: '最多 :max 个字符',
        validationPattern: '只支持字母或数字组合',
        validationEmail: '用户名不能为邮箱格式',
        statusTaken: '用户名已被占用',
        statusAvailable: '用户名可用'
    };

    var texts = window.jQuery ? jQuery.extend({}, defaults, cfg.texts || {}) : defaults;

    var usernameStatusCache = {};
    var usernameStatusInflight = {};

    function fetchUsernameStatus(username, onDone, onFail){
        var key = (username || '').toLowerCase();
        if (!key) {
            if (typeof onDone === 'function') {
                onDone(null);
            }
            return;
        }
        if (Object.prototype.hasOwnProperty.call(usernameStatusCache, key)) {
            if (typeof onDone === 'function') {
                onDone(usernameStatusCache[key]);
            }
            return;
        }
        if (!usernameStatusInflight[key]) {
            usernameStatusInflight[key] = [];
        } else {
            usernameStatusInflight[key].push({ done: onDone, fail: onFail });
            return;
        }
        usernameStatusInflight[key].push({ done: onDone, fail: onFail });
        var params = { m: 'usernameplugin', action: 'checkusername', username: username };
        if (cfg.ajaxToken) {
            params.token = cfg.ajaxToken;
        }
        jQuery.get('index.php', params, function(data){
            usernameStatusCache[key] = data || {};
            var queue = usernameStatusInflight[key] || [];
            delete usernameStatusInflight[key];
            for (var i = 0; i < queue.length; i++) {
                if (typeof queue[i].done === 'function') {
                    queue[i].done(usernameStatusCache[key]);
                }
            }
        }, 'json').fail(function(){
            var queue = usernameStatusInflight[key] || [];
            delete usernameStatusInflight[key];
            for (var i = 0; i < queue.length; i++) {
                if (typeof queue[i].fail === 'function') {
                    queue[i].fail();
                }
            }
        });
    }

    function ensureHiddenInput($form, name){
        var $hidden = $form.find('input[type="hidden"][name="' + name + '"]').first();
        if (!$hidden.length) {
            $hidden = jQuery('<input type="hidden" />').attr('name', name).appendTo($form);
        }
        return $hidden;
    }

    function text(name){
        return (texts && texts[name]) ? texts[name] : (defaults[name] || '');
    }

    function format(template, replacements){
        var output = template || '';
        if (!replacements) { return output; }
        for (var key in replacements) {
            if (!Object.prototype.hasOwnProperty.call(replacements, key)) { continue; }
            var value = replacements[key];
            var pattern = new RegExp(':'+key, 'g');
            output = output.replace(pattern, value);
        }
        return output;
    }

    // 登录与找回密码页：占位与标签改为“用户名或邮箱”
    var path = (location.pathname || '').toLowerCase();
    var page = (cfg.templatefile || '').toLowerCase();
    var isLogin = page === 'login' || path.indexOf('dologin.php') !== -1;
    var isPwReset = (page === 'pwreset' || page === 'passwordreset' || path.indexOf('pwreset.php') !== -1 || path.indexOf('/password/reset') !== -1 || path.indexOf('/password/reset/begin') !== -1)
        && path.indexOf('/password/reset/email') === -1
        && path.indexOf('/password/reset/confirm') === -1;
    var isRegister = page === 'register' || page === 'clientregister' || path.indexOf('register.php') !== -1;
    var isProfile = page === 'profile' || path.indexOf('clientarea.php') !== -1 && (location.search||'').indexOf('action=details') !== -1;

    if(isLogin){
        var loginPlaceholder = text('loginPlaceholder') || defaults.loginPlaceholder;
        var $u = jQuery('input[name="username"], input#inputEmail, input#username, input[name="email"]');
        $u.attr('placeholder', loginPlaceholder);
        $u.attr('type', 'text').removeAttr('pattern');
        jQuery('form').first().attr('novalidate', 'novalidate');
        jQuery('label[for="inputEmail"], label[for="username"], label[for="email"]').each(function(){
            var t = jQuery(this).text();
            if(t && t.length < 40){ jQuery(this).text(loginPlaceholder); }
        });
        if(!$u.length){ return; }
        var $form = jQuery('form').first();
        var $primaryInput = $u.first();
        var loginRenamed = false;
        var resubmittingLogin = false;

        function applyLoginMapping(data){
            if (!data || !data.exists) {
                return;
            }
            var mapped = (data && data.email && data.email.indexOf('@') !== -1) ? data.email : jQuery.trim($primaryInput.val()||'');
            if (!loginRenamed) {
                $u.each(function(){
                    var $el = jQuery(this);
                    var currentName = $el.attr('name') || '';
                    if (currentName && currentName.slice(-5) !== '_view') {
                        $el.attr('name', currentName + '_view');
                    }
                });
                loginRenamed = true;
            }
            ensureHiddenInput($form, 'username').val(mapped);
            ensureHiddenInput($form, 'email').val(mapped);
        }

        $form.on('submit', function(e){
            if (resubmittingLogin) {
                resubmittingLogin = false;
                return;
            }
            var val = jQuery.trim($primaryInput.val()||'');
            if (!val || val.indexOf('@') !== -1) { return; }
            var key = val.toLowerCase();
            if (Object.prototype.hasOwnProperty.call(usernameStatusCache, key)) {
                applyLoginMapping(usernameStatusCache[key]);
                return;
            }
            if (Object.prototype.hasOwnProperty.call(usernameStatusInflight, key)) {
                e.preventDefault();
                return;
            }
            e.preventDefault();
            fetchUsernameStatus(val, function(data){
                applyLoginMapping(data || {});
                resubmittingLogin = true;
                $form.trigger('submit');
            }, function(){
                resubmittingLogin = true;
                $form.trigger('submit');
            });
        });
    }
    if(isPwReset){
        var loginPlaceholder = text('loginPlaceholder') || defaults.loginPlaceholder;
        var $e = jQuery('input[name="email"], input#inputEmail');
        $e.attr('placeholder', loginPlaceholder);
        $e.attr('type', 'text').removeAttr('pattern');
        jQuery('form').first().attr('novalidate', 'novalidate');
        jQuery('label[for="inputEmail"], label[for="email"]').each(function(){
            var t = jQuery(this).text();
            if(t && t.length < 40){ jQuery(this).text(loginPlaceholder); }
        });
        if(!$e.length){ return; }
        var $form2 = jQuery('form').first();
        var emailRenamed = false;
        var resubmittingReset = false;

        function applyResetMapping(data){
            if (!data || !data.exists) {
                return;
            }
            var mapped = (data && data.email && data.email.indexOf('@') !== -1) ? data.email : jQuery.trim($e.val()||'');
            if (!emailRenamed) {
                var currentName = $e.attr('name') || '';
                if (currentName && currentName.slice(-5) !== '_view') {
                    $e.attr('name', currentName + '_view');
                }
                emailRenamed = true;
            }
            ensureHiddenInput($form2, 'email').val(mapped);
        }

        $form2.on('submit', function(e){
            if (resubmittingReset) {
                resubmittingReset = false;
                return;
            }
            var val = jQuery.trim($e.val()||'');
            if (!val || val.indexOf('@') !== -1) { return; }
            var key = val.toLowerCase();
            if (Object.prototype.hasOwnProperty.call(usernameStatusCache, key)) {
                applyResetMapping(usernameStatusCache[key]);
                return;
            }
            if (Object.prototype.hasOwnProperty.call(usernameStatusInflight, key)) {
                e.preventDefault();
                return;
            }
            e.preventDefault();
            fetchUsernameStatus(val, function(data){
                applyResetMapping(data || {});
                resubmittingReset = true;
                $form2.trigger('submit');
            }, function(){
                resubmittingReset = true;
                $form2.trigger('submit');
            });
        });
    }

    // 注册页：将“用户名”单独展示，并做占用检测（需有字段ID）
    if(isRegister && fieldId){
        var hiddenSelector = 'input[name="customfield['+fieldId+']"]';
        var $hidden = jQuery(hiddenSelector);
        // 创建独立的用户名输入框
        var $emailRow = jQuery('input[name="email"], #inputEmail').closest('.form-group, .form-row, .form-group-row, .row').first();
        var $row = jQuery(
            '<div class="form-group prepend-icon" id="username-plugin-row">\
\t<span class="field-icon"><i class="fas fa-id-card"></i></span>\
\t<input type="text" class="form-control" id="username" autocomplete="off">\
\t<small class="help-block text-muted" id="username-help"></small>\
\t</div>'
        );
        if($emailRow.length){ $row.insertBefore($emailRow); }
        else { jQuery('#frmCheckout, form#registration, form[action*="register"]').prepend($row); }

        $row.find('#username').attr('placeholder', text('registrationPlaceholder') || defaults.registrationPlaceholder);

        // 隐藏标题“用户名”，保留输入框
        $row.find('label[for="username"]').hide();
        // 强制使用 emoji 图标，避免 FA 图标变形
        $row.find('.field-icon').text('🆔');
        // 如果未加载 Font Awesome，则降级为黑白字符 ID
        if(!$row.find('.field-icon i').length || $row.find('.field-icon i').css('display') === 'none'){
            $row.find('.field-icon').text('ID');
        }

        // 使用固定定位，避免覆盖点击区域；pointer-events 关闭以保证可点击
        if(!document.getElementById('username-plugin-style')){
            var css = '#username-plugin-row{position:relative;}#username-plugin-row .field-icon{position:absolute;left:12px;top:0;bottom:0;display:flex;align-items:center;pointer-events:none;font-size:16px;line-height:1;z-index:1;}#username-plugin-row input#username{padding-left:2.6em;box-sizing:border-box;}';
            var s = document.createElement('style');
            s.type = 'text/css';
            s.id = 'username-plugin-style';
            s.appendChild(document.createTextNode(css));
            document.head.appendChild(s);
        }

        // 如果没有隐藏自定义字段，则自动创建一个隐藏字段，确保可提交
        if(!$hidden.length){
            var $form = jQuery('#frmCheckout, form#registration, form[action*="register"]').first();
            $hidden = jQuery('<input type="hidden" name="customfield['+fieldId+']" />').appendTo($form);
        }else{
            // 隐藏原有的自定义字段区域对应行（仅隐藏最小单元，避免整页内容被隐藏）
            var $hiddenRow = $hidden.closest('.form-group');
            if($hiddenRow.length){
                $hiddenRow.hide();
            }else{
                $hidden.css('display','none');
            }
        }

        // 绑定双向复制（提交时以隐藏字段为准），并尝试从隐藏字段回填
        var $input = $row.find('#username');
        if($hidden.val()){ $input.val($hidden.val()); }
        $input.on('input blur', function(){
            $hidden.val($input.val());
        });
        $('form').on('submit', function(){
            $hidden.val($input.val());
        });

        // 规则即时校验 + Ajax 实时检测
        var last = '';
        var $help = jQuery('#username-help');
        function show(msg, ok){
            $help.text(msg).css('color', ok ? '#28a745' : '#dc3545');
        }
        function validateLocal(v){
            if(!v) return '';
            if(cfg.minLength && v.length < cfg.minLength){ return format(text('validationMin'), {min: cfg.minLength}); }
            if(cfg.maxLength && v.length > cfg.maxLength){ return format(text('validationMax'), {max: cfg.maxLength}); }
            if(cfg.forbidEmail && /@/.test(v)){ return text('validationEmail'); }
            var pat = null;
            try{ pat = new RegExp(cfg.pattern); }catch(e){ pat = /^[A-Za-z0-9_]+$/; }
            if(!pat.test(v)){ return text('validationPattern'); }
            return '';
        }
        $input.on('blur', function(){
            var v = jQuery.trim($input.val());
            var err = validateLocal(v);
            if(err){ show(err, false); return; }
            if(!v || v.length < (cfg.minLength||3)){ return; }
            if(v === last) return;
            last = v;
            fetchUsernameStatus(v, function(data){
                if(data && data.exists){
                    show(text('statusTaken'), false);
                }else{
                    show(text('statusAvailable'), true);
                }
            }, function(){
                last = '';
            });
        });
        $input.on('input', function(){
            var v = jQuery.trim($input.val());
            var err = validateLocal(v);
            if(err){ show(err, false); }
            else if(v){ $help.text(''); }
        });

        // 显示“国家”选择（如果被模板隐藏）
        var $country = jQuery('select[name="country"], #inputCountry');
        if($country.length){
            var $grp = $country.closest('.form-group');
            $grp.show();
        }
    }

    // 我的资料页：在邮箱上方展示“用户名”，遵循 canSet 控制（需有字段ID且已登录）
    if(isProfile && fieldId && isLoggedIn){
        // 前端二次验证：确保用户真的已登录
        // 检查页面上是否有登录表单（如果有，说明用户未登录）
        var hasLoginForm = jQuery('form[action*="dologin"], form[action*="login"], input[name="username"][type!="hidden"], input[name="password"]').length > 0;
        
        // 检查是否有典型的登录页面元素
        var isLoginPage = jQuery('.login-form, #login, .logincontainer').length > 0;
        
        // 检查是否有已登录用户的导航元素
        var hasClientNav = jQuery('.client-nav, .user-nav, .account-nav, a[href*="clientarea.php?action=details"], a[href*="logout"]').length > 0;
        
        // 如果检测到登录表单或登录页面特征，且没有客户导航，则不注入字段
        if ((hasLoginForm || isLoginPage) && !hasClientNav) {
            // 防御性检查失败，用户可能未登录，跳过注入
            return;
        }
        
        var $emailRow = jQuery('input[name="email"], #inputEmail').closest('.form-group, .form-row, .form-group-row, .row').first();
        var $row = jQuery(
            '<div class="form-group" id="username-plugin-profile-row">\
\t<label class="control-label" for="username_profile"></label>\
\t<input type="text" class="form-control" id="username_profile" autocomplete="off">\
\t<small class="help-block text-muted" id="username-profile-help"></small>\
\t</div>'
        );
        if($emailRow.length){ $row.insertBefore($emailRow); }
        else { jQuery('form').first().prepend($row); }
        var $inp = $row.find('#username_profile');
        $row.find('label[for="username_profile"]').text(text('profileLabel'));
        $inp.attr('placeholder', text('profilePlaceholder'));
        $row.find('#username-profile-help').text(text('profileHelp'));
        if(cfg.username){ $inp.val(cfg.username); }

        // 确保存在隐藏字段 customfield[fieldId]，用于实际提交存储
        var $hidden = jQuery('input[name="customfield['+fieldId+']"]');
        if(!$hidden.length){
            var $form = jQuery('form').first();
            $hidden = jQuery('<input type="hidden" name="customfield['+fieldId+']" />').appendTo($form);
        }
        // 隐藏原有自定义字段所在行，避免重复显示（仅隐藏最小单元，避免整页内容被隐藏）
        var $hiddenRow = $hidden.closest('.form-group');
        if($hiddenRow.length){
            $hiddenRow.hide();
        }else{
            $hidden.css('display','none');
        }

        // 控制是否可设置：仅当 canSet==1（当前无用户名）时允许输入；否则只读锁定
        if(cfg.canSet === 1 || cfg.canSet === '1'){
            $inp.prop('readonly', false);
            var $formProfile = jQuery('form').first();

            // 同步输入到隐藏字段
            $inp.on('input blur', function(){
                $hidden.val(jQuery.trim($inp.val()||''));
            });
            // 提交前再次同步，保证一致
            $formProfile.on('submit', function(){
                $hidden.val(jQuery.trim($inp.val()||''));
            });

            // 资料页本地规则校验 + Ajax 唯一性检测（与注册页一致）
            var last = '';
            var $help = jQuery('#username-profile-help');
            function show(msg, ok){
                $help.text(msg).css('color', ok ? '#28a745' : '#dc3545');
            }
            function validateLocal(v){
                if(!v) return '';
                if(cfg.minLength && v.length < cfg.minLength){ return format(text('validationMin'), {min: cfg.minLength}); }
                if(cfg.maxLength && v.length > cfg.maxLength){ return format(text('validationMax'), {max: cfg.maxLength}); }
                if(cfg.forbidEmail && /@/.test(v)){ return text('validationEmail'); }
                var pat = null;
                try{ pat = new RegExp(cfg.pattern); }catch(e){ pat = /^[A-Za-z0-9_]+$/; }
                if(!pat.test(v)){ return text('validationPattern'); }
                return '';
            }
            $inp.on('blur', function(){
                var v = jQuery.trim($inp.val());
                var err = validateLocal(v);
                if(err){ show(err, false); return; }
                if(!v || v.length < (cfg.minLength||3)){ return; }
                if(v === last) return;
                last = v;
                fetchUsernameStatus(v, function(data){
                    if(data && data.exists){
                        show(text('statusTaken'), false);
                    }else{
                        show(text('statusAvailable'), true);
                    }
                }, function(){
                    last = '';
                });
            });
            $inp.on('input', function(){
                var v = jQuery.trim($inp.val());
                var err = validateLocal(v);
                if(err){ show(err, false); }
                else if(v){ $help.text(''); }
            });
        }else{
            $inp.prop('readonly', true);
            // 已有用户名时，强制使用旧值（若有）
            if(typeof cfg.username === 'string'){
                $hidden.val(cfg.username);
                $inp.val(cfg.username);
            }
        }
    }
});


