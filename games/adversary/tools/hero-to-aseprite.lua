-- hero-to-aseprite.lua — build layered, INDEXED .aseprite masters from the painted sheets.
--
-- Run (the -b is mandatory — never invoke the .app bundle itself, and never `open` it):
--   "<...>/Aseprite.app/Contents/MacOS/aseprite" -b --script tools/hero-to-aseprite.lua
--
-- Driven by tools/.aseprite-request.json, written by tools/hero-to-aseprite.mjs:
--   { outDir, variants: [ { id, palette: [hex...],
--       sheets: [ { id, frameW, frameH, frames, layers: [{name, png}] } ] } ] }
--
-- One .aseprite per (variant, animation set): N frames at the rig's own frame size, one LAYER
-- per body part in the rig's stacking order, INDEXED colour mode with the variant's palette
-- locked into slots 1..n. Layers mean the operator can repaint a forearm without touching the
-- torso beneath it; indexed mode means hand-polish cannot silently wander out of palette.
--
-- GOTCHAS, all inherited from snesos/tools/grids-to-aseprite.lua and all still live:
--   * `json` is a built-in global here — do not require it.
--   * Aseprite's numbers are floats. Image:putPixel with a float index SILENTLY CORRUPTS the
--     pixel rather than erroring, so every index goes through toInt().
--   * Index 0 is the transparent slot. Its RGB is meaningless and must never be matched
--     against, or transparent pixels get painted with slot 0's colour.
--   * A source PNG opens as an RGBA sprite; its pixels must be mapped to palette indices
--     explicitly, which is what the hex->index table below is for.

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

local function toInt(n)
  local i = math.tointeger(n)
  if i == nil then error("expected an integer-valued number, got " .. tostring(n)) end
  return i
end

local function hexToRGB(hex)
  return tonumber(hex:sub(2, 3), 16), tonumber(hex:sub(4, 5), 16), tonumber(hex:sub(6, 7), 16)
end

local toolsDir = scriptDir()
local request = json.decode(readFile(app.fs.joinPath(toolsDir, ".aseprite-request.json")))

local built = 0

for _, variant in ipairs(request.variants) do
  -- Palette: slot 0 stays transparent-black, the variant's colours fill 1..n.
  local paletteSize = #variant.palette + 1
  local indexOfHex = {}
  for i, hex in ipairs(variant.palette) do
    indexOfHex[hex:lower()] = i
  end

  for _, sheet in ipairs(variant.sheets) do
    local spr = Sprite(toInt(sheet.frameW), toInt(sheet.frameH), ColorMode.INDEXED)
    spr.transparentColor = 0

    local pal = spr.palettes[1]
    pal:resize(paletteSize)
    pal:setColor(0, Color { r = 0, g = 0, b = 0, a = 0 })
    for i, hex in ipairs(variant.palette) do
      local r, g, b = hexToRGB(hex)
      pal:setColor(i, Color { r = r, g = g, b = b, a = 255 })
    end

    -- Frames: the sprite starts with one; add the rest.
    local frameCount = toInt(sheet.frames)
    while #spr.frames < frameCount do spr:newFrame() end

    -- The default layer becomes the bottom-most part; the rest stack above it, so the
    -- request's layer order must already be bottom-to-top.
    local layers = {}
    for li, layerSpec in ipairs(sheet.layers) do
      local layer
      if li == 1 then layer = spr.layers[1] else layer = spr:newLayer() end
      layer.name = layerSpec.name
      layers[li] = layer
    end

    for li, layerSpec in ipairs(sheet.layers) do
      local src = app.open(layerSpec.png)
      if src == nil then error("could not open layer png " .. layerSpec.png) end
      local srcImg = src.cels[1].image
      local srcX = src.cels[1].position.x
      local srcY = src.cels[1].position.y

      for f = 1, frameCount do
        local img = Image(toInt(sheet.frameW), toInt(sheet.frameH), ColorMode.INDEXED)
        local originX = (f - 1) * toInt(sheet.frameW)
        local wrote = false

        for y = 0, toInt(sheet.frameH) - 1 do
          for x = 0, toInt(sheet.frameW) - 1 do
            -- Source pixels are in the opened sprite's cel space, which may be trimmed.
            local sx = originX + x - srcX
            local sy = y - srcY
            if sx >= 0 and sy >= 0 and sx < srcImg.width and sy < srcImg.height then
              local v = srcImg:getPixel(sx, sy)
              local a = app.pixelColor.rgbaA(v)
              if a >= 128 then
                local hex = string.format("#%02x%02x%02x",
                  app.pixelColor.rgbaR(v), app.pixelColor.rgbaG(v), app.pixelColor.rgbaB(v))
                local idx = indexOfHex[hex]
                if idx == nil then
                  error("layer " .. layerSpec.name .. " frame " .. f .. " uses " .. hex
                    .. ", which is not in variant " .. variant.id .. "'s palette")
                end
                img:putPixel(x, y, toInt(idx))
                wrote = true
              end
            end
          end
        end

        if wrote then
          spr:newCel(layers[li], f, img, Point(0, 0))
        end
      end

      src:close()
    end

    local outPath = app.fs.joinPath(request.outDir, variant.id .. "-" .. sheet.id .. ".aseprite")
    spr:saveAs(outPath)
    spr:close()
    built = built + 1
  end
end

print("hero-to-aseprite.lua: wrote " .. built .. " .aseprite files")
