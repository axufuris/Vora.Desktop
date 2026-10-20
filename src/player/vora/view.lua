local draw = require("draw")

local M = {}

local PAD = 32
local MARKER_STRONG = { Credits = true, CreditsScene = true, Preview = true }

local function clock(seconds)
    local total = math.max(0, math.floor(seconds or 0))
    local h = math.floor(total / 3600)
    local m = math.floor(total % 3600 / 60)
    local s = total % 60
    if h > 0 then
        return string.format("%d:%02d:%02d", h, m, s)
    end
    return string.format("%d:%02d", m, s)
end
M.clock = clock

local function luminance(hex)
    local r, g, b = tostring(hex or ""):match("^#(%x%x)(%x%x)(%x%x)$")
    if not r then
        return 0.5
    end
    return (0.2126 * tonumber(r, 16) + 0.7152 * tonumber(g, 16) + 0.0722 * tonumber(b, 16)) / 255
end

function M.palette(theme, hdr)
    local cap = hdr and 0.8 or 1
    local accent = theme and theme.accent or ""
    return {
        accent = draw.bgr(accent, "#f59e0b"),
        on_accent = luminance(accent ~= "" and accent or "#f59e0b") > 0.55 and draw.bgr("#0b0b0f", "#0b0b0f") or draw.bgr("#ffffff", "#ffffff", cap),
        surface = draw.bgr(theme and theme.surface, "#16161d"),
        text = draw.bgr(theme and theme.text, "#f4f4f6", cap),
        muted = draw.bgr(theme and theme.textMuted, "#9a9aa8", cap),
        info = draw.bgr("#60a5fa", "#60a5fa", cap),
        shade = draw.bgr("#000000", "#000000"),
    }
end

local function truncate(text, size, weight, width)
    local value = tostring(text or "")
    if draw.text_width(value, size, weight) <= width then
        return value
    end
    while #value > 1 and draw.text_width(value .. "…", size, weight) > width do
        value = value:sub(1, -2)
    end
    return value .. "…"
end

local Frame = {}
Frame.__index = Frame

local function new_frame(s)
    local u = math.min(s.width / 1920, s.height / 1080)
    return setmetatable({ s = s, u = u, out = {}, hits = {}, rows = {}, colors = M.palette(s.chrome and s.chrome.theme, s.hdr) }, Frame)
end

function Frame:hit(id, x1, y1, x2, y2, row)
    self.hits[#self.hits + 1] = { id = id, x1 = x1, y1 = y1, x2 = x2, y2 = y2 }
    if row then
        self.rows[row] = self.rows[row] or {}
        table.insert(self.rows[row], id)
    end
end

function Frame:lit(id)
    return self.s.hover == id or self.s.focus == id
end

function Frame:icon_button(id, name, cx, cy, size, row, options)
    local opts = options or {}
    local radius = size / 2 + 8 * self.u
    local disabled = opts.disabled
    if self:lit(id) and not disabled then
        draw.circle(self.out, cx, cy, radius, self.colors.accent, 0.28)
    end
    draw.icon(self.out, name, cx, cy, size, opts.color or self.colors.text, disabled and 0.3 or 1)
    if not disabled then
        self:hit(id, cx - radius, cy - radius, cx + radius, cy + radius, row)
    end
end

function Frame:button(id, label, x1, y1, x2, y2, primary, row)
    local u = self.u
    local lit = self:lit(id)
    if primary then
        draw.rect(self.out, x1, y1, x2, y2, (y2 - y1) / 2, self.colors.accent, lit and 1 or 0.92)
        draw.text(self.out, (x1 + x2) / 2, (y1 + y2) / 2, label, 16 * u, self.colors.on_accent, 1, { weight = 600 })
    else
        draw.rect(self.out, x1, y1, x2, y2, (y2 - y1) / 2, lit and self.colors.accent or self.colors.text, lit and 0.3 or 0.14)
        draw.text(self.out, (x1 + x2) / 2, (y1 + y2) / 2, label, 16 * u, self.colors.text, 1, { weight = 600 })
    end
    self:hit(id, x1, y1, x2, y2, row)
end

function Frame:scrims()
    local s, u = self.s, self.u
    draw.rect(self.out, -200 * u, -400 * u, s.width + 200 * u, 150 * u, 0, self.colors.shade, 0.62, 70 * u)
    draw.rect(self.out, -200 * u, s.height - 260 * u, s.width + 200 * u, s.height + 400 * u, 0, self.colors.shade, 0.72, 80 * u)
end

local function chips_of(chrome)
    local chips = {}
    for _, row in ipairs(chrome and chrome.info or {}) do
        if row.label == "Video" then
            for part in tostring(row.value):gmatch("[^·]+") do
                local chip = part:gsub("^%s+", ""):gsub("%s+$", "")
                if chip ~= "" then
                    chips[#chips + 1] = chip
                end
            end
        elseif row.label == "Audio" or row.label == "Container" or row.label == "Bitrate" then
            chips[#chips + 1] = row.value
        end
    end
    return chips
end

function Frame:header()
    local s, u, c = self.s, self.u, self.colors
    local chrome = s.chrome or {}
    self:icon_button("back", "back", PAD * u + 24 * u, PAD * u + 24 * u, 22 * u, 1)
    local title = chrome.title ~= "" and chrome.title or s.media_title
    local centre = s.width / 2
    local width = s.width - 2 * (PAD + 96) * u
    draw.text(self.out, centre, 54 * u, truncate(title, 26 * u, 600, width), 26 * u, c.text, 1, { weight = 600, shadow = 2 * u })
    if chrome.subtitle then
        draw.text(self.out, centre, 88 * u, truncate(chrome.subtitle, 18 * u, 400, width), 18 * u, c.text, 0.78, { shadow = 2 * u })
    end

    local chips = chips_of(chrome)
    if #chips == 0 then
        return
    end
    local size, gap, padding = 12 * u, 6 * u, 8 * u
    local widths, total = {}, 0
    for index, chip in ipairs(chips) do
        widths[index] = draw.text_width(chip, size, 600) + 2 * padding
        total = total + widths[index] + (index > 1 and gap or 0)
    end
    local x = centre - total / 2
    local y1, y2 = 112 * u, 136 * u
    for index, chip in ipairs(chips) do
        draw.rect(self.out, x, y1, x + widths[index], y2, 6 * u, c.surface, 0.72)
        draw.text(self.out, x + widths[index] / 2, (y1 + y2) / 2, chip, size, c.text, 1, { weight = 600 })
        x = x + widths[index] + gap
    end
end

function Frame:seek_geometry()
    local s, u = self.s, self.u
    local y = s.height - 148 * u
    return PAD * u + 84 * u, s.width - PAD * u - 84 * u, y
end

function Frame:seek_bar()
    local s, u, c = self.s, self.u, self.colors
    local x1, x2, y = self:seek_geometry()
    local duration = s.duration > 0 and s.duration or 0
    local position = s.scrub and s.scrub.position or s.position
    local lit = self:lit("seek") or s.scrub ~= nil
    local half = (lit and 5 or 3) * u

    draw.text(self.out, PAD * u, y, clock(position), 18 * u, c.text, 1, { align = 4, weight = 500 })
    draw.text(self.out, s.width - PAD * u, y, clock(duration), 18 * u, c.text, 1, { align = 6, weight = 500 })
    draw.rect(self.out, x1, y - half, x2, y + half, half, c.text, 0.22)

    if duration > 0 then
        local function at(seconds)
            return x1 + (x2 - x1) * math.max(0, math.min(1, seconds / duration))
        end
        local px = at(position)
        draw.rect(self.out, x1, y - half, px, y + half, half, c.accent, 1)
        local pointed = s.scrub or s.preview
        if pointed then
            local tx = at(pointed.position)
            local label = clock(pointed.position)
            local width = draw.text_width(label, 14 * u, 600) + 16 * u
            draw.rect(self.out, tx - width / 2, y - 26 * u, tx + width / 2, y - 6 * u, 6 * u, c.surface, 0.85)
            draw.text(self.out, tx, y - 16 * u, label, 14 * u, c.text, 1, { weight = 600 })
        end
        for _, marker in ipairs(s.chrome and s.chrome.markers or {}) do
            local strong = MARKER_STRONG[marker.kind]
            local mx1, mx2 = at(marker.start), math.max(at(marker["end"]), at(marker.start) + 2 * u)
            draw.rect(self.out, mx1, y - half, mx2, y + half, 0, strong and c.info or c.text, strong and 0.5 or 0.35)
        end
        if lit then
            draw.circle(self.out, px, y, 9 * u, c.accent, 1)
        end
    end
    self:hit("seek", x1 - 6 * u, y - 18 * u, x2 + 6 * u, y + 18 * u, 2)
end

function Frame:controls()
    local s, u, c = self.s, self.u, self.colors
    local chrome = s.chrome or {}
    local y = s.height - 80 * u
    local centre = s.width / 2
    local episode = chrome.canPlayNext ~= nil and (chrome.canPlayNext or chrome.canPlayPrevious)

    if episode then
        self:icon_button("previous", "previous", centre - 232 * u, y, 22 * u, 3, { disabled = not chrome.canPlayPrevious })
    end
    self:icon_button("back10", "back10", centre - 112 * u, y, 36 * u, 3)
    draw.text(self.out, centre - 112 * u, y + 3 * u, "10", 10 * u, c.text, 1, { weight = 700 })

    local playLit = self:lit("play")
    draw.circle(self.out, centre, y, 32 * u, c.accent, playLit and 1 or 0.94)
    draw.icon(self.out, s.paused and "play" or "pause", centre + (s.paused and 2 * u or 0), y, 28 * u, c.on_accent, 1)
    self:hit("play", centre - 32 * u, y - 32 * u, centre + 32 * u, y + 32 * u, 3)

    self:icon_button("forward30", "forward30", centre + 112 * u, y, 36 * u, 3)
    draw.text(self.out, centre + 112 * u, y + 3 * u, "30", 10 * u, c.text, 1, { weight = 700 })
    if episode then
        self:icon_button("next", "next", centre + 232 * u, y, 22 * u, 3, { disabled = not chrome.canPlayNext })
    end

    local x = s.width - PAD * u - 20 * u
    self:icon_button("fullscreen", "fullscreen", x, y, 22 * u, 3)
    x = x - 60 * u
    local volumeIcon = (s.mute or s.volume <= 0) and "volume-muted" or (s.volume < 50 and "volume-low" or "volume")
    if s.volume_open then
        local sx2 = x - 30 * u
        local sx1 = sx2 - 110 * u
        draw.rect(self.out, sx1, y - 3 * u, sx2, y + 3 * u, 3 * u, c.text, 0.22)
        local level = s.mute and 0 or math.max(0, math.min(1, s.volume / 100))
        draw.rect(self.out, sx1, y - 3 * u, sx1 + (sx2 - sx1) * level, y + 3 * u, 3 * u, c.accent, 1)
        draw.circle(self.out, sx1 + (sx2 - sx1) * level, y, 7 * u, c.accent, 1)
        self:hit("volume-slider", sx1 - 6 * u, y - 16 * u, sx2 + 6 * u, y + 16 * u)
        self.volume_slider = { x1 = sx1, x2 = sx2 }
    end
    self:icon_button("volume", volumeIcon, x, y, 22 * u, 3)
    x = x - (s.volume_open and 176 or 60) * u
    self:icon_button("settings", "settings", x, y, 22 * u, 3)
    x = x - 60 * u
    local subtitleOn = false
    for _, option in ipairs(chrome.subtitles or {}) do
        if option.selected then
            subtitleOn = true
        end
    end
    if #(chrome.subtitles or {}) > 0 then
        self:icon_button("subtitles", "subtitles", x, y, 22 * u, 3, { color = subtitleOn and c.accent or nil })
        x = x - 60 * u
    end
    self:icon_button("info", "info", x, y, 22 * u, 3)
end

function Frame:skip_chip()
    local s, u, c = self.s, self.u, self.colors
    local skip = s.chrome and s.chrome.skip
    if not skip then
        return
    end
    local _, _, seekY = self:seek_geometry()
    local width = draw.text_width(skip.label, 18 * u, 600) + 76 * u
    local x2, y2 = s.width - 48 * u, seekY - 40 * u
    local x1, y1 = x2 - width, y2 - 56 * u
    local lit = self:lit("skip")
    draw.rect(self.out, x1, y1, x2, y2, 8 * u, c.accent, lit and 1 or 0.94)
    draw.text(self.out, x1 + 24 * u, (y1 + y2) / 2, skip.label, 18 * u, c.on_accent, 1, { align = 4, weight = 600 })
    draw.icon(self.out, "next", x2 - 30 * u, (y1 + y2) / 2, 20 * u, c.on_accent, 1)
    self:hit("skip", x1, y1, x2, y2, 4)
end

function Frame:up_next()
    local s, u, c = self.s, self.u, self.colors
    local card = s.chrome and s.chrome.upNext
    if not card then
        return
    end
    local _, _, seekY = self:seek_geometry()
    local x2, y2 = s.width - 48 * u, seekY - 40 * u
    local x1, y1 = x2 - 460 * u, y2 - 210 * u
    draw.rect(self.out, x1, y1, x2, y2, 16 * u, c.surface, 0.94)
    self:hit("card", x1, y1, x2, y2)
    draw.text(self.out, x1 + 24 * u, y1 + 30 * u, "UP NEXT", 12 * u, c.muted, 1, { align = 4, weight = 700 })
    draw.text(self.out, x1 + 24 * u, y1 + 64 * u, truncate(card.title, 22 * u, 600, 412 * u), 22 * u, c.text, 1, { align = 4, weight = 600 })
    if card.subtitle then
        draw.text(self.out, x1 + 24 * u, y1 + 96 * u, truncate(card.subtitle, 16 * u, 400, 412 * u), 16 * u, c.muted, 1, { align = 4 })
    end
    local countdown = card.countdownSeconds
    if countdown then
        draw.text(self.out, x1 + 24 * u, y1 + 128 * u, countdown > 0 and string.format("Playing in %ds", countdown) or "Starting…", 15 * u, c.text, 0.9, { align = 4 })
    end
    local by1, by2 = y2 - 64 * u, y2 - 22 * u
    self:button("upnext-play", "Play now", x1 + 24 * u, by1, x1 + 184 * u, by2, true, 5)
    if countdown then
        self:button("upnext-cancel", "Cancel", x1 + 200 * u, by1, x1 + 330 * u, by2, false, 5)
    end
end

local PANEL_TITLES = { settings = "Playback settings", subtitles = "Subtitles", info = "Playback info" }

function Frame:panel_items()
    local chrome = self.s.chrome or {}
    local items = {}
    if self.s.panel == "settings" then
        items[#items + 1] = { heading = "Quality", note = chrome.quality and chrome.quality.currentLabel }
        for _, option in ipairs(chrome.quality and chrome.quality.options or {}) do
            items[#items + 1] = { id = "quality:" .. option.id, label = option.label, selected = option.selected }
        end
        items[#items + 1] = { heading = "Audio" }
        for _, option in ipairs(chrome.audio or {}) do
            items[#items + 1] = { id = "audio:" .. option.id, label = option.label, detail = option.detail, selected = option.selected }
        end
    elseif self.s.panel == "subtitles" then
        local any = false
        for _, option in ipairs(chrome.subtitles or {}) do
            any = any or option.selected
        end
        items[#items + 1] = { id = "subtitle:off", label = "Off", selected = not any }
        for _, option in ipairs(chrome.subtitles or {}) do
            items[#items + 1] = { id = "subtitle:" .. option.id, label = option.label, detail = option.detail, selected = option.selected }
        end
    elseif self.s.panel == "info" then
        for _, row in ipairs(chrome.info or {}) do
            items[#items + 1] = { info = row.label, value = row.value }
        end
    end
    return items
end

function Frame:panel()
    local s, u, c = self.s, self.u, self.colors
    if not s.panel then
        return
    end
    local x2, y1 = s.width - PAD * u, (PAD + 72) * u
    local x1, y2 = x2 - 470 * u, s.height - 200 * u
    draw.rect(self.out, x1, y1, x2, y2, 16 * u, c.surface, 0.96)
    self:hit("card", x1, y1, x2, y2)
    draw.text(self.out, x1 + 28 * u, y1 + 40 * u, PANEL_TITLES[s.panel], 22 * u, c.text, 1, { align = 4, weight = 600 })
    self:icon_button("panel-close", "close", x2 - 40 * u, y1 + 40 * u, 20 * u, 1)

    local y = y1 + 84 * u
    local row = 10
    for _, item in ipairs(self:panel_items()) do
        if y > y2 - 40 * u then
            break
        end
        if item.heading then
            y = y + 8 * u
            draw.text(self.out, x1 + 28 * u, y + 12 * u, item.heading:upper(), 12 * u, c.muted, 1, { align = 4, weight = 700 })
            y = y + 30 * u
            if item.note and item.note ~= "" then
                draw.text(self.out, x1 + 28 * u, y + 8 * u, truncate(item.note, 15 * u, 400, 410 * u), 15 * u, c.muted, 1, { align = 4 })
                y = y + 30 * u
            end
        elseif item.info then
            draw.text(self.out, x1 + 28 * u, y + 16 * u, item.info, 15 * u, c.muted, 1, { align = 4 })
            draw.text(self.out, x2 - 28 * u, y + 16 * u, truncate(item.value, 15 * u, 500, 280 * u), 15 * u, c.text, 1, { align = 6, weight = 500 })
            y = y + 36 * u
        else
            local height = (item.detail and 58 or 44) * u
            local ry1, ry2 = y, y + height
            if self:lit(item.id) or item.selected then
                draw.rect(self.out, x1 + 12 * u, ry1, x2 - 12 * u, ry2, 10 * u, c.accent, self:lit(item.id) and 0.3 or 0.16)
            end
            if item.selected then
                draw.circle(self.out, x1 + 34 * u, (ry1 + ry2) / 2, 5 * u, c.accent, 1)
            end
            local textY = item.detail and ry1 + 20 * u or (ry1 + ry2) / 2
            draw.text(self.out, x1 + 54 * u, textY, truncate(item.label, 17 * u, 500, 370 * u), 17 * u, c.text, 1, { align = 4, weight = item.selected and 600 or 500 })
            if item.detail then
                draw.text(self.out, x1 + 54 * u, ry1 + 42 * u, truncate(item.detail, 14 * u, 400, 370 * u), 14 * u, c.muted, 1, { align = 4 })
            end
            self:hit(item.id, x1 + 12 * u, ry1, x2 - 12 * u, ry2, row)
            row = row + 1
            y = ry2 + 4 * u
        end
    end
end

function Frame:spinner()
    local s, u, c = self.s, self.u, self.colors
    local cx, cy, r = s.width / 2, s.height / 2, 30 * u
    for index = 0, 7 do
        local angle = s.spin + index * math.pi / 4
        local opacity = 0.15 + 0.85 * (index / 7)
        draw.circle(self.out, cx + math.cos(angle) * r, cy + math.sin(angle) * r, 5 * u, c.text, opacity)
    end
end

function Frame:error_card()
    local s, u, c = self.s, self.u, self.colors
    local x1, x2 = s.width / 2 - 340 * u, s.width / 2 + 340 * u
    local y1, y2 = s.height / 2 - 110 * u, s.height / 2 + 110 * u
    draw.rect(self.out, x1, y1, x2, y2, 16 * u, c.surface, 0.96)
    self:hit("card", x1, y1, x2, y2)
    draw.text(self.out, s.width / 2, y1 + 50 * u, "The video stopped", 22 * u, c.text, 1, { weight = 600 })
    draw.text(self.out, s.width / 2, y1 + 96 * u, truncate(s.chrome and s.chrome.statusText, 16 * u, 400, 620 * u), 16 * u, c.muted, 1)
    self:button("back", "Back", s.width / 2 - 80 * u, y2 - 70 * u, s.width / 2 + 80 * u, y2 - 26 * u, true, 1)
end

function Frame:indicator()
    local s, u, c = self.s, self.u, self.colors
    local shown = s.indicator
    if not shown then
        return
    end
    local cx, cy = s.width / 2, s.height / 2
    if shown.icon then
        draw.circle(self.out, cx, cy, 48 * u, c.surface, 0.7)
        draw.icon(self.out, shown.icon, cx + (shown.icon == "play" and 3 * u or 0), cy, 40 * u, c.text, 1)
    else
        local width = draw.text_width(shown.text, 22 * u, 600) + 48 * u
        draw.rect(self.out, cx - width / 2, cy - 30 * u, cx + width / 2, cy + 30 * u, 30 * u, c.surface, 0.7)
        draw.text(self.out, cx, cy, shown.text, 22 * u, c.text, 1, { weight = 600 })
    end
end

function M.render(s)
    local frame = new_frame(s)
    local status = s.chrome and s.chrome.status
    if status == "error" then
        frame:scrims()
        frame:error_card()
        return frame
    end
    if s.visible then
        frame:scrims()
        frame:header()
        frame:seek_bar()
        frame:controls()
        frame:panel()
    end
    frame:skip_chip()
    frame:up_next()
    if s.loading then
        frame:spinner()
    end
    frame:indicator()
    return frame
end

return M
