Monday board configuration fix

MONDAY_BOARD_ID in Netlify now takes priority over any previously saved board. For your current board use 18424671786. When the board changes, old column and group mappings are cleared and detected again. Same-board mappings are preserved.

Deploy this complete project to your existing Netlify site, including functions, using your normal Git or Netlify CLI deployment. Then open Analytics and click Sync Monday & Refresh. If access still fails, the error now identifies the board being requested; check the API token account can access it. No live Monday access was tested; 37 automated tests passed.
