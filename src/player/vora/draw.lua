local icons = require("icons")

local M = {}

local KAPPA = 0.5523

local function num(value)
    return string.format("%.1f", value)
end

function M.escape(text)
    return (tostring(text or ""):gsub("\\", "\\\239\187\160"):gsub("{", "\\{"):gsub("}", "\\}"):gsub("\n", " "))
end

function M.bgr(hex, fallback, cap)
    local r, g, b = tostring(hex or ""):match("^#(%x%x)(%x%x)(%x%x)$")
    if not r then
        r, g, b = fallback:match("^#(%x%x)(%x%x)(%x%x)$")
    end
    local scale = cap or 1
    local function channel(value)
        return string.format("%02X", math.floor(tonumber(value, 16) * scale + 0.5))
    end
    return channel(b) .. channel(g) .. channel(r)
end

function M.alpha(opacity)
    local clamped = math.max(0, math.min(1, opacity))
    return string.format("%02X", math.floor((1 - clamped) * 255 + 0.5))
end

local function fill_tags(color, opacity, blur)
    return string.format("{\\rDefault\\an7\\pos(0,0)\\bord0\\shad0\\blur%s\\1c&H%s&\\1a&H%s&\\p1}", num(blur or 0), color, M.alpha(opacity))
end

function M.rounded_path(x1, y1, x2, y2, radius)
    local r = math.max(0, math.min(radius, (x2 - x1) / 2, (y2 - y1) / 2))
    local k = r * KAPPA
    return table.concat({
        "m", num(x1 + r), num(y1),
        "l", num(x2 - r), num(y1),
        "b", num(x2 - r + k), num(y1), num(x2), num(y1 + r - k), num(x2), num(y1 + r),
        "l", num(x2), num(y2 - r),
        "b", num(x2), num(y2 - r + k), num(x2 - r + k), num(y2), num(x2 - r), num(y2),
        "l", num(x1 + r), num(y2),
        "b", num(x1 + r - k), num(y2), num(x1), num(y2 - r + k), num(x1), num(y2 - r),
        "l", num(x1), num(y1 + r),
        "b", num(x1), num(y1 + r - k), num(x1 + r - k), num(y1), num(x1 + r), num(y1),
    }, " ")
end

function M.rect(out, x1, y1, x2, y2, radius, color, opacity, blur)
    if x2 <= x1 or y2 <= y1 or opacity <= 0 then
        return
    end
    out[#out + 1] = fill_tags(color, opacity, blur) .. M.rounded_path(x1, y1, x2, y2, radius) .. "{\\p0}"
end

function M.circle(out, cx, cy, radius, color, opacity)
    M.rect(out, cx - radius, cy - radius, cx + radius, cy + radius, radius, color, opacity)
end

function M.text(out, x, y, text, size, color, opacity, options)
    local opts = options or {}
    out[#out + 1] = string.format(
        "{\\rDefault\\an%d\\pos(%s,%s)\\fnInter\\fs%s\\b%d\\bord0\\shad%s\\4c&H000000&\\4a&H%s&\\1c&H%s&\\1a&H%s&\\q2}%s",
        opts.align or 5, num(x), num(y), num(size), opts.weight or 400, num(opts.shadow or 0), M.alpha(0.55), color, M.alpha(opacity),
        M.escape(text))
end

function M.icon(out, name, cx, cy, size, color, opacity)
    local icon = icons[name]
    if not icon then
        return
    end
    local scale = size / icons.size * 100
    local x = cx - size / 2
    local y = cy - size / 2
    if icon.stroke then
        local border = icon.stroke / 2 * size / 24
        out[#out + 1] = string.format(
            "{\\rDefault\\an7\\pos(%s,%s)\\fscx%s\\fscy%s\\bord%s\\shad0\\blur0\\1a&HFF&\\3c&H%s&\\3a&H%s&\\p1}%s{\\p0}",
            num(x), num(y), num(scale), num(scale), num(border), color, M.alpha(opacity), icon.drawing)
    else
        out[#out + 1] = string.format(
            "{\\rDefault\\an7\\pos(%s,%s)\\fscx%s\\fscy%s\\bord0\\shad0\\blur0\\1c&H%s&\\1a&H%s&\\p1}%s{\\p0}",
            num(x), num(y), num(scale), num(scale), color, M.alpha(opacity), icon.drawing)
    end
end

function M.text_width(text, size, weight)
    local factor = (weight or 400) >= 600 and 0.58 or 0.54
    return #tostring(text or "") * size * factor
end

return M
