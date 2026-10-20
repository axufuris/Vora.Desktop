local mp = require("mp")
local msg = require("mp.msg")
local utils = require("mp.utils")
local view = require("view")

local HIDE_AFTER = 3
local INDICATOR_FOR = 0.7
local THUMBNAIL_OVERLAY = 7

local overlay = mp.create_osd_overlay("ass-events")

local s = {
    chrome = nil,
    media_title = "",
    position = 0,
    duration = 0,
    paused = false,
    cache_wait = false,
    volume = 100,
    mute = false,
    hdr = false,
    width = 1920,
    height = 1080,
    visible = true,
    last_input = mp.get_time(),
    panel = nil,
    focus = nil,
    hover = nil,
    scrub = nil,
    preview = nil,
    pressed = nil,
    dragging = nil,
    indicator = nil,
    volume_open = false,
    volume_until = 0,
    sprite = nil,
    thumbnail = nil,
    spin = 0,
    loading = false,
}

local frame = nil

local function send(intent)
    local json = utils.format_json(intent)
    if json then
        mp.commandv("script-message", "vora-intent", json)
    end
end

local function exit_player()
    send({ type = "exit" })
    mp.add_timeout(5, function() mp.commandv("quit") end)
end

local function hide_thumbnail()
    if s.thumbnail then
        mp.commandv("overlay-remove", tostring(THUMBNAIL_OVERLAY))
        s.thumbnail = nil
    end
end

local function cue_at(seconds)
    local sprite = s.sprite
    if not sprite then
        return nil
    end
    for _, cue in ipairs(sprite.cues) do
        if seconds >= cue.start and seconds < cue["end"] then
            return cue
        end
    end
    return sprite.cues[#sprite.cues]
end

local function show_thumbnail(seconds, x)
    local sprite = s.sprite
    local cue = cue_at(seconds)
    if not sprite or not cue or not frame then
        msg.debug(string.format("No scrub thumbnail at %.1f s (sprite %s)", seconds, sprite and "loaded" or "missing"))
        hide_thumbnail()
        return
    end
    local _, _, seekY = frame:seek_geometry()
    local left = math.floor(math.max(8, math.min(s.width - sprite.cueWidth - 8, x - sprite.cueWidth / 2)))
    local top = math.floor(seekY - sprite.cueHeight - 28 * frame.u)
    local key = table.concat({ cue.x, cue.y, left, top }, ":")
    if s.thumbnail == key then
        return
    end
    s.thumbnail = key
    local offset = cue.y * sprite.stride + cue.x * 4
    mp.commandv("overlay-add", tostring(THUMBNAIL_OVERLAY), tostring(left), tostring(top), sprite.file, tostring(offset), "bgra",
        tostring(sprite.cueWidth), tostring(sprite.cueHeight), tostring(sprite.stride))
end

local function chrome_needed()
    return s.paused or s.panel ~= nil or s.scrub ~= nil or (s.chrome and (s.chrome.upNext ~= nil or s.chrome.status ~= "playing"))
end

local function render()
    local dims = mp.get_property_native("osd-dimensions")
    if dims and dims.w and dims.w > 0 then
        s.width, s.height = dims.w, dims.h
    end
    s.loading = s.cache_wait or (s.chrome ~= nil and s.chrome.status == "loading")
    if s.volume_open and mp.get_time() > s.volume_until and s.hover ~= "volume" and s.hover ~= "volume-slider" and s.focus ~= "volume" and not s.dragging then
        s.volume_open = false
    end
    if s.indicator and mp.get_time() > s.indicator.untilTime then
        s.indicator = nil
    end
    frame = view.render(s)
    overlay.res_x, overlay.res_y = s.width, s.height
    overlay.data = table.concat(frame.out, "\n")
    overlay:update()
    local shown = s.scrub or s.preview
    if shown and s.visible and s.duration > 0 then
        local x1, x2 = frame:seek_geometry()
        show_thumbnail(shown.position, x1 + (x2 - x1) * shown.position / s.duration)
    else
        hide_thumbnail()
    end
end

local function touch()
    s.last_input = mp.get_time()
    if not s.visible then
        s.visible = true
    end
end

local function hide_chrome()
    s.visible = false
    s.focus = nil
    s.scrub = nil
    s.preview = nil
    s.hover = nil
end

local function indicate(icon, text)
    s.indicator = { icon = icon, text = text, untilTime = mp.get_time() + INDICATOR_FOR }
end

local function seek_to(seconds)
    local target = math.max(0, s.duration > 0 and math.min(s.duration, seconds) or seconds)
    s.position = target
    send({ type = "seek", to = target })
end

local function seek_by(delta)
    seek_to(s.position + delta)
    indicate(nil, delta < 0 and string.format("−%d s", -delta) or string.format("+%d s", delta))
end

local function toggle_pause()
    indicate(s.paused and "play" or "pause")
    send({ type = "toggle-pause" })
end

local function set_volume(level)
    local value = math.max(0, math.min(100, level))
    mp.set_property_number("volume", value)
    if value > 0 and s.mute then
        mp.set_property_bool("mute", false)
    end
    s.volume_open = true
    s.volume_until = mp.get_time() + 1.5
    indicate(nil, string.format("Volume %d%%", math.floor(value + 0.5)))
end

local function toggle_mute()
    mp.set_property_bool("mute", not s.mute)
    indicate(nil, s.mute and "Sound on" or "Muted")
end

local function select_item(id)
    local kind, value = id:match("^(%a+):(.+)$")
    if kind == "quality" then
        send({ type = "select-quality", id = value })
    elseif kind == "audio" then
        send({ type = "select-audio", id = value })
    elseif kind == "subtitle" then
        send({ type = "select-subtitle", id = value ~= "off" and value or nil })
    end
end

local function open_panel(name)
    s.panel = s.panel ~= name and name or nil
    s.focus = nil
end

local actions = {
    back = exit_player,
    play = toggle_pause,
    back10 = function() seek_by(-10) end,
    forward30 = function() seek_by(30) end,
    previous = function() send({ type = "play-previous" }) end,
    next = function() send({ type = "play-next" }) end,
    info = function() open_panel("info") end,
    subtitles = function() open_panel("subtitles") end,
    settings = function() open_panel("settings") end,
    volume = toggle_mute,
    fullscreen = function() mp.commandv("cycle", "fullscreen") end,
    skip = function() send({ type = "skip-marker" }) end,
    ["upnext-play"] = function() send({ type = "play-next" }) end,
    ["upnext-cancel"] = function() send({ type = "cancel-up-next" }) end,
    ["panel-close"] = function() s.panel = nil s.focus = nil end,
}

local function activate(id)
    if not id then
        return
    end
    if actions[id] then
        actions[id]()
    elseif id:find(":") then
        select_item(id)
    end
end

local function hit_at(x, y)
    if not frame then
        return nil
    end
    for index = #frame.hits, 1, -1 do
        local hit = frame.hits[index]
        if x >= hit.x1 and x <= hit.x2 and y >= hit.y1 and y <= hit.y2 then
            return hit.id
        end
    end
    return nil
end

local function seconds_at(x)
    if not frame or s.duration <= 0 then
        return 0
    end
    local x1, x2 = frame:seek_geometry()
    return math.max(0, math.min(1, (x - x1) / (x2 - x1))) * s.duration
end

local function volume_at(x)
    local slider = frame and frame.volume_slider
    if not slider then
        return s.volume
    end
    return math.max(0, math.min(1, (x - slider.x1) / (slider.x2 - slider.x1))) * 100
end

local function mouse()
    local pos = mp.get_property_native("mouse-pos")
    if pos then
        return pos.x, pos.y
    end
    return mp.get_mouse_pos()
end

local function on_mouse_move()
    local x, y = mouse()
    touch()
    s.hover = hit_at(x, y)
    if s.hover == "volume" or s.hover == "volume-slider" then
        s.volume_open = true
        s.volume_until = mp.get_time() + 1.5
    end
    s.preview = nil
    if s.dragging == "seek" then
        s.scrub = { position = seconds_at(x) }
    elseif s.dragging == "volume-slider" then
        set_volume(volume_at(x))
    elseif s.hover == "seek" and s.duration > 0 then
        s.preview = { position = seconds_at(x) }
    end
    render()
end

local function on_click(event)
    local x, y = mouse()
    touch()
    local id = hit_at(x, y)
    if event.event == "press" then
        if id then
            activate(id)
        elseif s.panel then
            s.panel = nil
        else
            toggle_pause()
        end
    elseif event.event == "down" then
        s.pressed = id
        if id == "seek" then
            s.dragging = "seek"
            s.scrub = { position = seconds_at(x) }
        elseif id == "volume-slider" then
            s.dragging = "volume-slider"
            set_volume(volume_at(x))
        end
    elseif event.event == "up" then
        if s.dragging == "seek" and s.scrub then
            seek_to(s.scrub.position)
            s.scrub = nil
        elseif s.dragging == nil and s.pressed == id then
            if id then
                activate(id)
            elseif s.panel then
                s.panel = nil
            else
                toggle_pause()
            end
        end
        s.dragging = nil
        s.pressed = nil
    end
    render()
end

local function focus_rows()
    if not frame then
        return {}
    end
    local keys = {}
    for key in pairs(frame.rows) do
        if (s.panel and (key >= 10 or key == 1)) or (not s.panel and key < 10) then
            keys[#keys + 1] = key
        end
    end
    table.sort(keys)
    local rows = {}
    for _, key in ipairs(keys) do
        rows[#rows + 1] = frame.rows[key]
    end
    return rows
end

local function locate(rows, id)
    for r, row in ipairs(rows) do
        for c, item in ipairs(row) do
            if item == id then
                return r, c
            end
        end
    end
    return nil, nil
end

local function default_focus(rows)
    for _, row in ipairs(rows) do
        for _, item in ipairs(row) do
            if item == "play" or item:find(":") then
                return item
            end
        end
    end
    return rows[1] and rows[1][1] or nil
end

local function move_focus(dr, dc)
    local rows = focus_rows()
    if #rows == 0 then
        return
    end
    local r, c = locate(rows, s.focus)
    if not r then
        s.focus = default_focus(rows)
        return
    end
    if dc ~= 0 then
        local row = rows[r]
        s.focus = row[math.max(1, math.min(#row, c + dc))]
        return
    end
    local target = math.max(1, math.min(#rows, r + dr))
    local row = rows[target]
    local share = (c - 1) / math.max(1, #rows[r] - 1)
    s.focus = row[math.floor(share * (#row - 1) + 1.5)]
end

local function key(name, handler)
    mp.add_key_binding(nil, name, function()
        handler()
        render()
    end, { repeatable = true })
end

key("left", function()
    if not s.visible then
        seek_by(-10)
        return
    end
    touch()
    if s.focus == "seek" then
        s.scrub = { position = math.max(0, (s.scrub and s.scrub.position or s.position) - 10) }
    else
        move_focus(0, -1)
    end
end)

key("right", function()
    if not s.visible then
        seek_by(30)
        return
    end
    touch()
    if s.focus == "seek" then
        s.scrub = { position = math.min(s.duration, (s.scrub and s.scrub.position or s.position) + 10) }
    else
        move_focus(0, 1)
    end
end)

key("up", function()
    local shown = s.visible
    touch()
    if not shown or not s.focus then
        s.focus = default_focus(focus_rows())
        return
    end
    s.scrub = nil
    move_focus(-1, 0)
end)

key("down", function()
    local shown = s.visible
    touch()
    if not shown or not s.focus then
        s.focus = default_focus(focus_rows())
        return
    end
    s.scrub = nil
    move_focus(1, 0)
end)

key("enter", function()
    local shown = s.visible
    touch()
    if s.focus == "seek" and s.scrub then
        seek_to(s.scrub.position)
        s.scrub = nil
    elseif shown and s.focus then
        activate(s.focus)
    else
        toggle_pause()
    end
end)

key("play-pause", function()
    touch()
    toggle_pause()
end)

key("back", function()
    if s.scrub then
        s.scrub = nil
    elseif s.panel then
        s.panel = nil
        s.focus = nil
    elseif s.visible and not chrome_needed() then
        hide_chrome()
    else
        exit_player()
    end
end)

key("exit", exit_player)
key("volume-up", function() touch() set_volume(s.volume + 5) end)
key("volume-down", function() touch() set_volume(s.volume - 5) end)
key("mute", function() touch() toggle_mute() end)
key("fullscreen", function() mp.commandv("cycle", "fullscreen") end)
key("next", function() send({ type = "play-next" }) end)
key("previous", function() send({ type = "play-previous" }) end)

mp.add_key_binding(nil, "mouse-move", on_mouse_move)
mp.add_key_binding(nil, "click", on_click, { complex = true })
mp.add_key_binding(nil, "double-click", function()
    local x, y = mouse()
    if not hit_at(x, y) and not s.panel then
        mp.commandv("cycle", "fullscreen")
    end
end)
mp.add_key_binding(nil, "mouse-leave", function()
    s.hover = nil
    s.preview = nil
    render()
end)

mp.register_script_message("state", function(json)
    local parsed = utils.parse_json(json)
    if type(parsed) == "table" then
        s.chrome = parsed
        render()
    end
end)

mp.register_script_message("sprite", function(json)
    local parsed = json ~= "" and utils.parse_json(json) or nil
    hide_thumbnail()
    if type(parsed) == "table" and type(parsed.cues) == "table" then
        s.sprite = parsed
    else
        s.sprite = nil
    end
end)

mp.observe_property("time-pos", "number", function(_, value)
    if value then
        s.position = value
    end
end)
mp.observe_property("duration", "number", function(_, value) s.duration = value or 0 end)
mp.observe_property("media-title", "string", function(_, value) s.media_title = value or "" end)
mp.observe_property("pause", "bool", function(_, value)
    s.paused = value == true
    if s.paused then
        touch()
    end
    render()
end)
mp.observe_property("paused-for-cache", "bool", function(_, value)
    s.cache_wait = value == true
    render()
end)
mp.observe_property("volume", "number", function(_, value) s.volume = value or 100 end)
mp.observe_property("mute", "bool", function(_, value) s.mute = value == true end)
mp.observe_property("video-out-params", "native", function(_, value)
    local gamma = type(value) == "table" and value.gamma or nil
    s.hdr = gamma == "pq" or gamma == "hlg"
end)
mp.observe_property("osd-dimensions", "native", function() render() end)
mp.register_event("file-loaded", function()
    s.panel = nil
    s.focus = nil
    s.scrub = nil
    touch()
    render()
end)

mp.add_periodic_timer(0.25, function()
    if s.visible and not chrome_needed() and s.dragging == nil and mp.get_time() - s.last_input > HIDE_AFTER then
        hide_chrome()
    end
    if s.visible or s.indicator or s.loading or (s.chrome and (s.chrome.skip or s.chrome.upNext)) then
        render()
    elseif frame and #frame.out > 0 then
        render()
    end
end)

mp.add_periodic_timer(0.05, function()
    if s.loading then
        s.spin = s.spin + 0.35
        render()
    end
end)

render()
msg.verbose("The Vora player chrome is ready")
mp.commandv("script-message", "vora-ready")
