-- aseprite-audit.lua — report frame count, layer count and colour mode for every .aseprite
-- in a directory, in ONE headless invocation.
--
--   "<...>/Aseprite.app/Contents/MacOS/aseprite" -b --script-param dir=<path> \
--       --script tools/aseprite-audit.lua
--
-- Consumed by tools/verify-paintover.mjs --aseprite. Prints one AUDIT line per file; the
-- verifier parses those against the rig manifest, so a master with the wrong frame count or a
-- flattened layer stack fails the build rather than shipping quietly.

local dir = app.params["dir"]
if dir == nil or dir == "" then error("aseprite-audit.lua: --script-param dir=<path> required") end

local names = {}
for _, entry in ipairs(app.fs.listFiles(dir)) do
  if entry:match("%.aseprite$") then table.insert(names, entry) end
end
table.sort(names)

local MODE_NAMES = {
  [ColorMode.RGB] = "RGB",
  [ColorMode.GRAY] = "GRAY",
  [ColorMode.INDEXED] = "INDEXED",
}

for _, name in ipairs(names) do
  local path = app.fs.joinPath(dir, name)
  local spr = app.open(path)
  if spr == nil then
    print("AUDITFAIL " .. name .. " could-not-open")
  else
    print(string.format("AUDIT %s frames=%d layers=%d mode=%s",
      name, #spr.frames, #spr.layers, MODE_NAMES[spr.colorMode] or "UNKNOWN"))
    spr:close()
  end
end
