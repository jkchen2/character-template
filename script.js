// This doesn't really follow any specific established style. Sorry.

const VERSION = 2;
const COMMON_ATTRIBUTES = ['Species', 'Height', 'Age', 'Gender', 'Sexuality'];
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';

var start_data = {'fetched': false};
var shown_limit_warning = false,
    potential_changes = false,
    space_pressed = false,
    okay_callback = null,
    overwriting = false;

function _qs(selector) { return document.querySelector(selector); }
function _qa(selector) { return document.querySelectorAll(selector); }
function _al(target, listeners) { listeners.forEach(it => target.addEventListener('input', it)); }
function _fc() { potential_changes = true; }

// Stupid Edge forEach polyfill
if (!NodeList.prototype.forEach)
    NodeList.prototype.forEach = Array.prototype.forEach;

async function main() {
    _qs('#version').innerText = VERSION;

    // Set textarea event listeners
    _al(_qs('#color_value textarea'), [preview_color, _fc]);
    _al(_qs('#thumbnail_entry textarea'), [auto_resize, _fc]);
    _al(_qs('#name_entry textarea'), [count_total_characters, check_name, _fc]);
    _al(_qs('#tags_entry textarea'), [parse_tags, auto_resize, _fc]);

    window.onbeforeunload = _ => potential_changes ? 'Unsaved changes will be lost.' : null;

    // Check if data can be loaded
    var split = window.location.hash.replace('#', '').split(':');
    if (split.length == 2) {
        if (!await fetch_start_data(split))
            return;
        if (!await check_session_validity())
            return;
        if (start_data.editing)
            load_editing_data(start_data.editing);
        else
            COMMON_ATTRIBUTES.forEach(it => add_attribute_entry(it, ''));
        clicked_okay();
    } else {
        COMMON_ATTRIBUTES.forEach(it => add_attribute_entry(it, ''));
        show_message(
            'You are creating a character without a session. It is recommended that you use ' +
            'the Discord bot to start a session, as this will enable automated submission.\n\n' +
            'Without a session, submission is disabled, but you can still save your character manually.');
        _qs('#submit_button').classList.add('disabled');
        _qs('#session_warning').classList.remove('hidden');
    }

    add_attribute_entry();
    add_image_entry();
    count_total_characters();

}

function load_editing_data(editing) {
    // Clear existing attributes
    var container = _qs('#attribute_container');
    while (container.children.length)
        container.removeChild(container.children[0]);
    container = _qs('#images_container');
    while (container.children.length)
        container.removeChild(container.children[0]);

    // Fill in editing data
    _qs('#type_' + editing.type).checked = true;
    var name_entry = _qs('#name_entry textarea');
    name_entry.value = editing.name;
    check_name.call(name_entry);
    var thumbnail_textarea = _qs('#thumbnail_entry textarea');
    thumbnail_textarea.value = editing.thumbnail === null ? '' : editing.thumbnail;
    auto_resize.call(thumbnail_textarea);
    if (editing.embed_color !== null)
        _qs('#embed_color textarea').value = '#' + editing.embed_color.toString(16).padStart(6, '0');
    else
        _qs('#embed_color textarea').value = '';
    preview_color();

    // Version differences
    if (editing.version == 1) {
        for (var it in editing.attributes)
            add_attribute_entry(it, editing.attributes[it]);
    } else {
        for (var it = 0; it < editing.attribute_order.length; it++) {
            var current = editing.attribute_order[it];
            add_attribute_entry(current, editing.attributes[current]);
        }
    }
    _qs('#tags_entry textarea').value = editing.version == 1 ? '' : editing.tags_raw;
    parse_tags();
    for (var it = 0; it < editing.images.length; it++)
        add_image_entry(editing.images[it], editing.version);
}

async function fetch_start_data(url_args) {
    show_message('Please wait...\nFetching session data', false);
    var data_url = 'https://cdn.discordapp.com/attachments/' + url_args[0] + '/' + url_args[1] + '/data';

    // Download session data
    try {
        var response = await fetch(CORS_PROXY + data_url);
        var parsed = await response.json();
    } catch (e) {
        console.log(e);
        show_message('Failed to download session data. Error:\n' + e.name, false);
        return false;
    }
    if (response.status != 200) {
        show_message('Failed to download session data. Check your internet connection and reload the page.', false);
        return false;
    }

    // Set start data
    try {
        if (parsed) {
            start_data.hook_url = 'https://canary.discordapp.com/api/webhooks/' + parsed.webhook[0] + '/' + parsed.webhook[1];
            start_data.existing_names = parsed.existing_names;
            start_data.editing = parsed.editing;
            start_data.fetched = true;
            return true;
        }
    } catch (e) {
        console.log(e);
        show_message('Failed to parse session data. Error:\n' + e.name, false);
        return false;
    }
    show_message('Session data is invalid. Please start a new session via the Discord bot.', false);
    return false;
}

async function check_session_validity() {
    show_message('Please wait...\nChecking session validity', false);
    try {
        var response = await fetch(start_data.hook_url);
        var parsed = await response.json();
        start_data.hook_data = parsed;
    } catch (e) {
        console.log(e);
        show_message('Failed to check session validity. Error:\n' + e.name, false);
        return false;
    }
    if (response.status == 404) {
        show_message('This session no longer exists. Please start a new one via the Discord bot.', false);
        return false;
    }
    if (response.status != 200) {
        show_message('Failed to check session validity. Please try again later.', false);
        return false;
    }
    if (!parsed.name.startsWith('ready')) {
        show_message('This session is in-use. Please only use sessions one at a time.', false);
        return false;
    }
    return true;
}

function add_attribute_entry(name = '', value = '') {
    var container = _qs('#attribute_container');
    if (container.children.length >= 20)
        return;
    var template_attribute = _qs('#template_attribute_entry');
    var clone = template_attribute.cloneNode(true);
    clone.removeAttribute('id');
    var textareas = clone.querySelectorAll('textarea');
    textareas[0].value = name;
    textareas[1].value = value;
    _al(textareas[0], [detect_common_attribute, count_total_characters, auto_add_attribute, _fc]);
    _al(textareas[1], [count_total_characters, auto_add_attribute, auto_resize, _fc]);
    var countdown = clone.querySelector('.countdown');
    var maxlength = COMMON_ATTRIBUTES.includes(name) ? 50 : 1000;
    textareas[1].maxLength = maxlength;
    countdown.innerText = maxlength;
    container.appendChild(clone);
    auto_resize.call(textareas[1]);
}

function detect_common_attribute() {
    var value_textarea = this.parentElement.nextElementSibling.children[0];
    value_textarea.maxLength = COMMON_ATTRIBUTES.includes(this.value) ? 50 : 1000;
    auto_resize.call(value_textarea);
}

function auto_add_attribute() {
    var entry = this.parentElement.parentElement;
    var container = entry.parentElement;
    var textareas = entry.querySelectorAll('textarea');
    if (container.children.length < 20 &&
        entry.nextElementSibling === null &&
        (textareas[0].value || textareas[1].value)) {
        add_attribute_entry();
    }
}

function remove_attribute_entry() {
    var entry = this.parentElement;
    var container = entry.parentElement;
    container.removeChild(entry);

    // Always keep one empty attribute available
    if (container.children.length == 0) {
        add_attribute_entry();
    } else if (container.children.length < 20) {
        var last_entry = container.children[container.children.length - 1];
        var textareas = last_entry.querySelectorAll('textarea');
        if (textareas[0].value || textareas[1].value)
            add_attribute_entry();
    }

    count_total_characters();
}

function auto_resize() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight - 35) + 'px';
    this.style.maxHeight = this.style.height;
    if (this.scrollHeight <= 60) {  // Firefox scroll fix
        this.style.height = '16px';
        this.style.maxHeight = '16px';
    }
    var countdown = this.parentElement.nextElementSibling;
    var remaining = this.maxLength - this.value.length;
    countdown.innerText = remaining;
    if (remaining <= 5)
        countdown.classList.add('warning_color');
    else
        countdown.classList.remove('warning_color');
}

function clear_value(limit = 200) {
    var value_textarea = this.nextElementSibling.children[0];
    value_textarea.value = '';
    this.nextElementSibling.nextElementSibling.innerText = limit;
    auto_resize.call(value_textarea);
}

function add_image_entry(value = null, version = VERSION) {
    var container = _qs('#images_container');
    if (container.children.length >= 10)
        return;
    var clone = _qs('#template_image_entry').cloneNode(true);
    clone.removeAttribute('id');

    // Set entry based on version
    var textareas = clone.querySelectorAll('textarea');
    if (value) {
        if (version == 1) {
            textareas[0].value = value;
        } else {
            textareas[0].value = value[0];
            textareas[1].value = value[1];
            textareas[2].value = value[2];
        }

    }

    textareas.forEach(it => {
        _al(it, [auto_add_image, auto_resize, _fc]);
        auto_resize.call(it);
    });
    container.appendChild(clone);
    return clone;
}

function auto_add_image() {
    var entry = this.closest('.entry');
    if (entry.parentElement.children.length < 10 &&
        entry.nextElementSibling === null &&
        this.value.length != 0) {
        add_image_entry();
    }
}

function remove_image_entry() {
    var entry = this.parentElement;
    var container = entry.parentElement;
    container.removeChild(entry);

    // Always keep one empty image entry available
    if (container.children.length == 0) {
        add_image_entry();
    } else if (container.children.length < 10) {
        var last_entry = container.children[container.children.length - 1];
        if (last_entry.querySelector('textarea').value.length) {
            add_image_entry();
        }
    }
}

function count_total_characters(warn = true) {
    var matches = _qa('.count_characters textarea');
    var countdown = _qs('#total_countdown');
    var total_characters = 0;
    for (var it = 0; it < matches.length; it++)
        total_characters += matches[it].value.length;

    // Add a warning as well
    var remaining = 3000 - total_characters;
    if (remaining <= 100)
        countdown.classList.add('warning_color');
    else
        countdown.classList.remove('warning_color');
    countdown.innerText = total_characters;
    if (warn) {
        if (remaining <= 0 && !shown_limit_warning) {
            shown_limit_warning = true;
            show_message(
                'You have reached the total character limit. You can keep adding content, ' +
                'but you will not be able to save or submit your character data until the ' +
                'total character count is below 3000.\n\n(Visuals do not count towards the limit)');
        } else if (remaining > 0 && shown_limit_warning) {
            shown_limit_warning = false;
        }
    }

    return total_characters;
}

function prevent_input(event) {
    if (event.keyCode == 32) {
        space_pressed = true;
        event.preventDefault();
    }
}

function check_valid_key(event) {
    if (event.keyCode == 13 || event.keyCode == 32 && space_pressed) {
        space_pressed = false;
        clicked_okay();
    }
}

function show_message(message, button = true, callback = null) {
    _qa('.okay_action').forEach(it => button ? it.classList.remove('hidden') : it.classList.add('hidden'));
    _qs('#notification_text').innerText = message;
    _qs('#notification_container').classList.remove('hidden');
    if (button)
        document.addEventListener('keyup', check_valid_key);
    document.addEventListener('keydown', prevent_input);
    okay_callback = callback;
}

function clicked_okay(use_callback = true) {
    _qs('#notification_container').classList.add('hidden');
    document.removeEventListener('keyup', check_valid_key);
    document.removeEventListener('keydown', prevent_input);
    if (use_callback && okay_callback)
        okay_callback();
    okay_callback = null;
}

function preview_color(preview = true) {
    var value = _qs('#color_value textarea').value;
    var preview = _qs('#color_preview textarea');
    if (preview && value.length < 6) {
        preview.style.backgroundColor = null;
        preview.style.color = 'var(--fg-primary)';
        preview.value = 'Color preview';
        return;
    }
    var [parsed, value] = parse_color(value);
    if (preview) {
        if (isNaN(parsed)) {
            preview.style.backgroundColor = null;
            preview.style.color = 'rgba(255, 0, 0, 1.0)';
            preview.value = 'Invalid hex color';
        } else {
            var luminance = Number('0x' + value.slice(0, 2))*0.2126 +
                            Number('0x' + value.slice(2, 4))*0.7152 + 
                            Number('0x' + value.slice(4, 6))*0.0722;
            preview.style.color = luminance < 128 ? 'white' : 'black';
            preview.style.backgroundColor = '#' + value;
            preview.value = '#' + value.toUpperCase();
        }
    }
}

function parse_color(value = null) {
    if (!value)
        value = _qs('#color_value textarea').value;
    value = value.slice(value.length - 6);
    return [value.length == 6 ? Number('0x' + value) : NaN, value];
}

function check_name(update_tags = true) {
    var expression = /[0-9a-z-_]+/g;
    var parsed = '', result;
    while (result = expression.exec(this.value.toLowerCase()))
        parsed += result[0];
    if (parsed && start_data.fetched && start_data.existing_names.includes(parsed)) {
        _qs('#edit_warning').classList.remove('hidden');
        overwriting = true;
    } else {
        _qs('#edit_warning').classList.add('hidden');
        overwriting = false;
    }
    if (update_tags)
        parse_tags.call(_qs('#tags_entry textarea'));
    return parsed;
}

function parse_tags() {
    var tags = [];

    // Use query selector because of the delete button
    var textarea = _qs('#tags_entry textarea');
    if (textarea.value.length && !textarea.value.startsWith('#'))
        textarea.value = '#' + textarea.value;

    // If a type is given, add it to the tags list
    var type = _qs('#type_selector input:checked');
    if (type)
        tags.push(type.value);

    // If a name is given, add it to the tags list
    var expression = /[0-9a-z-_]+/g;
    var name = check_name.call(_qs('#name_entry textarea'), false);
    if (name && !tags.includes(name))
        tags.push(name);

    // Parse each entry
    textarea.value.split('#').forEach(it => {
        var parsed = '', result;
        while (result = expression.exec(it.trim().toLowerCase()))
            parsed += result[0];
        if (parsed && !tags.includes(parsed))
            tags.push(parsed);
    });

    // Update preview
    var preview_area = _qs('#tags_preview');
    if (tags.length)
        preview_area.innerText = '#' + tags.join('   #');
    else
        preview_area.innerText = '';
    return tags;
}

function check_data() {
    var issues = [];

    // Check character type and name
    if (!_qs('#type_selector input:checked'))
        issues.push('A character type needs to be selected.');
    if (!check_name.call(_qs('#name_entry textarea')))
        issues.push('A name is required.');

    // Check attributes
    var used_names = [];
    var matches = _qa('#attribute_container .entry');
    for (var it = 0; it < matches.length; it++) {
        var textareas = matches[it].querySelectorAll('textarea');
        var name = textareas[0].value, value = textareas[1].value;
        if (!name && !value)
            continue;
        if (!name)
            issues.push('Attribute ' + (it+1) + ' is missing a name.');
        if (!value)
            issues.push('Attribute "' + name + '" is missing a value.');
        if (used_names.includes(name))
            issues.push('Duplicate attribute name "' + name + '"');
        used_names.push(name);
    }

    // Check image metadata entries
    matches = _qa('.metadata_container');
    for (it = 0; it < matches.length; it++) {
        var textareas = matches[it].querySelectorAll('textarea');
        var values = [textareas[0].value, textareas[1].value, textareas[2].value];
        if (!values[0] && !values[1] && !values[2])
            continue;
        if (!values[0])
            issues.push('Image ' + (it+1) + ' is missing the direct image URL.');
    }

    var color_value = _qs('#color_value textarea').value;
    if (color_value && isNaN(parse_color(color_value)[0]))
        issues.push('The embed color is an invalid hex color.');

    if (count_total_characters(false) > 3000)
        issues.push('The total character limit is exceeded.');

    if (issues.length) {
        show_message('These issue(s) were detected:\n\n- ' + issues.join('\n- '));
        return false;
    }
    return true;
}

function gather_data() {
    var thumbnail = _qs('#thumbnail_entry textarea').value;
    var gathered = {
        'version': VERSION,
        'type': _qs('#type_selector input:checked').value,
        'name': _qs('#name_entry textarea').value,
        'clean_name': check_name.call(_qs('#name_entry textarea')),
        'owner_id': null,
        'attributes': {},
        'attribute_order': [],
        'thumbnail': thumbnail ? thumbnail : null,
        'images': [],
        'embed_color': parse_color()[0],
        'tags': parse_tags(),
        'tags_raw': _qs('#tags_entry textarea').value,
        'created': null
    };
    _qa('#attribute_container .entry').forEach(it => {
        var textareas = it.querySelectorAll('textarea');
        var name = textareas[0].value, value = textareas[1].value;
        if (name && value) {
            gathered.attributes[name] = value;
            gathered.attribute_order.push(name);
        }
    });
    _qa('#images_container .metadata_container').forEach(it => {
        var textareas = it.querySelectorAll('textarea');
        var values = [textareas[0].value, textareas[1].value, textareas[2].value];
        if (values[0])
            gathered.images.push(values);
    });
    return gathered;
}

function clicked_load_from_disk() {
    var reader = new FileReader();
    reader.onload = function() {
        _qs('#file_selector').value = '';
        try {
            var parsed = JSON.parse(reader.result);
        } catch (e) {
            console.log(e);
            show_message('Failed to read the character file. Error:\n' + e.name);
            return;
        }
        load_editing_data(parsed);
        add_attribute_entry();
        add_image_entry();
        count_total_characters();
        potential_changes = false;
    };

    function _select() {
        var file_selector = _qs('#file_selector');
        file_selector.onchange = _ => reader.readAsText(file_selector.files[0]);
        file_selector.click();
    }

    if (potential_changes)
        show_message('Loading a character will overwrite any unsaved changes.', true, _select);
    else
        _select();
}

function clicked_save_to_disk() {
    var passed = check_data();
    if (passed) {
        var gathered = gather_data();
        var downloader = _qs('#downloader');  // SO: 3665115
        downloader.href = window.URL.createObjectURL(new Blob([JSON.stringify(gathered, null, 4)]));
        downloader.download = gathered.clean_name + '.character';
        downloader.click();
        potential_changes = false;
    }
}

async function clicked_submit() {
    show_message('Please wait...\nSubmitting data', false);

    function _end_session() {
        _qs('#submit_button').classList.add('disabled');
        _qs('#session_warning').classList.remove('hidden');
        fetch(start_data.hook_url, {
            headers: {'Content-Type': 'application/json'},
            method: 'POST',
            body: JSON.stringify({content: '2'})
        });
    }

    async function _send_data(payload) {
        var form = new FormData();
        var blob = new Blob([JSON.stringify(payload)]);
        form.append('content', '1');
        form.append('file', blob, 'data');
        var response = await fetch(start_data.hook_url, {
            method: 'POST',
            body: form
        });
        if (response.status != 200) {
            show_message('Failed to submit data.\nStatus code ' + response.status);
            return false;
        }

        // Try 5 times to verify submission
        for (var it = 0; it < 5; it++) {
            await new Promise(_ => setTimeout(_, 2000));
            show_message('Please wait...\nVerifying submission', false);
            response = await fetch(start_data.hook_url);
            if (response.status == 404) {
                show_message(
                    'Data could not be submitted because the session no longer exists. ' +
                    '(Have you submitted a character on this session previously?)');
            } else if (response.status != 200) {
                show_message('Failed to check session status.\nStatus code ' + response.status);
                return false;
            }
            var parsed = await response.json();
            if (parsed.name && !parsed.name.startsWith('ready'))
                break;
        }

        // Interpret return code
        _end_session()
        if (parsed.name) {
            if (parsed.name.startsWith('ok')) {
                potential_changes = false;
                show_message(
                    'Your character has been successfully ' + (overwriting ? 'edited!' : 'submitted!') +
                    '\n\nThis session is now expired.');
            } else if (parsed.name.startsWith('err')) {
                var error_code = parsed.name.split(':')[1];
                var description = 'Unknown error.';
                var descriptions = {
                    '1': 'Invalid input',
                    '2': 'Invalid thumbnail URL',
                    '3': 'Invalid image URL',
                    '4': 'Version is outdated. Please save and reload the page.'
                }
                if (error_code in descriptions)
                    description = descriptions[error_code];
                show_message(
                    'Failed to submit character data. The session has been cancelled.\n' +
                    'Error: ' + description);
            } else {
                show_message(
                    'The submission could not be verified. ' +
                    'Please check your direct messages on Discord.');
            }
        } else {
            show_message('The submission could not be verified. The webhook data is invalid.');
        }

    }

    if (check_data())
        await _send_data(gather_data())
}
