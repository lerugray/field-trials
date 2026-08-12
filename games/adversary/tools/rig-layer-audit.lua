-- rig-layer-audit.lua — read the rig pack's Aseprite sources and report, per sheet, per
-- layer, the exact colours that layer's pixels use.
--
-- WHY A LUA SCRIPT: the first version of this audit shelled out to `aseprite -b --layer X
-- --sheet out.png` once per layer per sheet — around eighty process launches, each of which
-- bounces the macOS Dock even in batch mode. This does the whole audit inside ONE headless
-- invocation and writes JSON, so nothing is exported and nothing is launched twice.
--
-- Run (the -b is mandatory — never invoke the .app bundle itself):
--   "<...>/Aseprite.app/Contents/MacOS/aseprite" -b --script tools/rig-layer-audit.lua
--
-- Input : tools/.rig-audit-request.json  { root, sheets: [{id, aseprite}] }
-- Output: tools/.rig-audit-raw.json      { sheets: [{id, layers:[{name, colors:{hex:count}}]}] }
--
-- Gotchas respected (from snesos/tools/grids-to-aseprite.lua):
--   * `json` is a built-in global in Aseprite's Lua — do not require it.
--   * Aseprite numbers are floats; anything used as an integer goes through math.tointeger.
--   * Indexed sprites store palette indices, so colours must be resolved via the palette,
--     and index 0 (the transparent slot) carries a meaningless RGB that must be skipped.

local function scriptDir()
  local info = debug.getinfo(1, "S")
  return app.fs.filePath(info.source:sub(2))
end

local function readFile(path)
  local f, err = io.open(path, "r")
  if not f then error("could not open " .. path .. ": " .. tostring(err)) end
  local c = f:read("a")
  f:close()
  return c
end

local function writeFile(path, text)
  local f, err = io.open(path, "w")
  if not f then error("could not write " .. path .. ": " .. tostring(err)) end
  f:write(text)
  f:close()
end

local function toInt(n)
  local i = math.tointeger(n)
  if i == nil then error("expected integer, got " .. tostring(n)) end
  return i
end

local function hex2(v)
  return string.format("%02x", toInt(v))
end

local toolsDir = scriptDir()
local request = json.decode(readFile(app.fs.joinPath(toolsDir, ".rig-audit-request.json")))

local result = { sheets = {} }

for _, sheet in ipairs(request.sheets) do
  local path = app.fs.joinPath(request.root, sheet.aseprite)
  local entry = { id = sheet.id, layers = {}, order = {} }

  if not app.fs.isFile(path) then
    entry.missing = true
  else
    local spr = app.open(path)
    if spr == nil then
      entry.missing = true
    else
      local indexed = spr.colorMode == ColorMode.INDEXED
      local grayscale = spr.colorMode == ColorMode.GRAY
      local pal = spr.palettes[1]

      -- spr.layers is bottom-to-top; record that order so the compositor can be checked
      -- against the pack's real stacking rather than an assumed one.
      for _, layer in ipairs(spr.layers) do
        table.insert(entry.order, layer.name)
      end

      for _, layer in ipairs(spr.layers) do
        local counts = {}
        if layer.isImage then
          for _, cel in ipairs(layer.cels) do
            local img = cel.image
            for it in img:pixels() do
              local v = it()
              local r, g, b, a
              if indexed then
                local idx = toInt(v)
                if idx == (spr.transparentColor or 0) then
                  a = 0
                else
                  local c = pal:getColor(idx)
                  r, g, b, a = c.red, c.green, c.blue, c.alpha
                end
              elseif grayscale then
                local gy = app.pixelColor.grayaV(v)
                r, g, b = gy, gy, gy
                a = app.pixelColor.grayaA(v)
              else
                r = app.pixelColor.rgbaR(v)
                g = app.pixelColor.rgbaG(v)
                b = app.pixelColor.rgbaB(v)
                a = app.pixelColor.rgbaA(v)
              end
              if a ~= nil and a >= 128 then
                local key = "#" .. hex2(r) .. hex2(g) .. hex2(b)
                counts[key] = (counts[key] or 0) + 1
              end
            end
          end
        end
        table.insert(entry.layers, { name = layer.name, colors = counts })
      end

      spr:close()
    end
  end

  table.insert(result.sheets, entry)
end

writeFile(app.fs.joinPath(toolsDir, ".rig-audit-raw.json"), json.encode(result))
print("rig-layer-audit.lua: audited " .. #result.sheets .. " sheets")
