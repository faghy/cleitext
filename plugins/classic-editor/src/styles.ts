/** Styles of the editor screen (`ce-` classes), added once to the admin page. */
export const SCREEN_CSS = `
.ce-screen{flex:1;min-height:0;overflow:auto;background:#f0f0f1;color:#1d2327;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif}
.ce-wrap{max-width:960px;margin:0 auto;padding:20px 16px 40px}
.ce-notice{margin:0 0 12px;padding:8px 12px;background:#fff;border-left:4px solid #dba617;box-shadow:0 1px 1px rgba(0,0,0,.04)}
.ce-tools{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;flex-wrap:wrap}
.ce-button{display:inline-flex;align-items:center;gap:4px;min-height:30px;padding:0 10px;border:1px solid #2271b1;border-radius:3px;background:#f6f7f7;color:#2271b1;font-size:13px;line-height:2.15;cursor:pointer;white-space:nowrap}
.ce-button:hover{background:#f0f0f1;border-color:#0a4b78;color:#0a4b78}
.ce-button:focus-visible{outline:2px solid #2271b1;outline-offset:1px}
.ce-button:disabled{opacity:.5;cursor:default}
.ce-button-primary{background:#2271b1;border-color:#2271b1;color:#fff}
.ce-button-primary:hover{background:#135e96;border-color:#135e96;color:#fff}
.ce-button svg{width:18px;height:18px}
.ce-tabs{display:flex;gap:0;margin-bottom:-1px}
.ce-tab{height:29px;margin:0 0 0 5px;padding:3px 8px 4px;border:1px solid #dcdcde;border-bottom:0;background:#f6f7f7;color:#50575e;font-size:13px;line-height:19px;cursor:pointer;border-radius:0}
.ce-tab[aria-selected=true]{background:#f6f7f7;color:#50575e;border-bottom:1px solid #f6f7f7}
.ce-tab[aria-selected=false]{background:#ebebeb}
.ce-area{margin-top:0;border:1px solid #dcdcde;background:#fff}
.ce-visual .tox.tox-tinymce{border:0;border-radius:0}
.ce-visual .tox .tox-editor-header{border-bottom:1px solid #dcdcde;box-shadow:none;padding:0}
.ce-row2-hidden .tox-toolbar-overlord>.tox-toolbar:nth-child(2){display:none}
.ce-quicktags{display:flex;flex-wrap:wrap;gap:2px;padding:3px;border-bottom:1px solid #dcdcde;background:#f6f7f7}
.ce-qt{min-width:26px;height:26px;margin:2px;padding:0 6px;border:1px solid #c3c4c7;border-radius:3px;background:#f6f7f7;color:#2c3338;font:13px/24px Consolas,Monaco,monospace;cursor:pointer}
.ce-qt:hover{background:#fff;border-color:#8c8f94}
.ce-qt:disabled{opacity:.5;cursor:default}
.ce-qt-b{font-weight:600}.ce-qt-i{font-style:italic}.ce-qt-link{text-decoration:underline}.ce-qt-del{text-decoration:line-through}
.ce-textarea{display:block;box-sizing:border-box;width:100%;min-height:440px;margin:0;padding:10px;border:0;resize:vertical;background:#fff;color:#1d2327;font:13px/1.6 Consolas,Monaco,monospace;tab-size:4}
.ce-textarea:focus{outline:none;box-shadow:inset 0 0 0 1px #2271b1}
.ce-status{display:flex;justify-content:space-between;padding:6px 10px;border-top:1px solid #dcdcde;background:#f6f7f7;color:#50575e;font-size:12px}
.ce-hidden{display:none!important}
.ce-modal{position:fixed;inset:0;z-index:100000;display:flex;align-items:stretch;justify-content:center;padding:30px;background:rgba(0,0,0,.7)}
.ce-modal-box{position:relative;display:flex;flex-direction:column;width:100%;max-width:1200px;background:#fff;box-shadow:0 5px 15px rgba(0,0,0,.7);overflow:hidden}
.ce-modal-head{display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:50px;border-bottom:1px solid #dcdcde}
.ce-modal-head h2{margin:0;font-size:22px;font-weight:600;line-height:50px}
.ce-modal-x{width:50px;height:50px;border:0;background:none;color:#646970;font-size:24px;cursor:pointer}
.ce-modal-x:hover{color:#135e96}
.ce-modal-tabs{display:flex;gap:4px;padding:0 16px;border-bottom:1px solid #dcdcde}
.ce-modal-tab{padding:10px 12px;border:0;border-bottom:4px solid transparent;background:none;color:#2271b1;font-size:14px;cursor:pointer}
.ce-modal-tab[aria-selected=true]{border-bottom-color:#1d2327;color:#1d2327;font-weight:600}
.ce-modal-body{display:flex;flex:1;min-height:0}
.ce-library{flex:1;min-width:0;display:flex;flex-direction:column;padding:12px 16px;overflow:auto}
.ce-library input[type=search]{max-width:260px;margin-bottom:12px;padding:4px 8px;border:1px solid #8c8f94;border-radius:4px;font-size:13px}
.ce-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;margin:0;padding:0;list-style:none}
.ce-grid li{margin:0}
.ce-thumb{position:relative;display:block;width:100%;aspect-ratio:1;padding:0;border:0;background:#f0f0f1;box-shadow:inset 0 0 15px rgba(0,0,0,.1),inset 0 0 0 1px rgba(0,0,0,.05);cursor:pointer;overflow:hidden}
.ce-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.ce-thumb span{display:flex;align-items:center;justify-content:center;height:100%;padding:8px;font-size:12px;word-break:break-all;color:#50575e}
.ce-thumb[aria-pressed=true]{box-shadow:inset 0 0 0 3px #fff,inset 0 0 0 7px #2271b1}
.ce-details{width:280px;flex-shrink:0;padding:12px 16px;border-left:1px solid #dcdcde;background:#f6f7f7;overflow:auto}
.ce-details h3{margin:12px 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;color:#646970}
.ce-details img{max-width:120px;max-height:120px;display:block;margin-bottom:8px}
.ce-field{display:block;margin-bottom:10px}
.ce-field span{display:block;margin-bottom:3px;color:#50575e}
.ce-field input,.ce-field select,.ce-field textarea{box-sizing:border-box;width:100%;padding:3px 6px;border:1px solid #8c8f94;border-radius:4px;font-size:13px;background:#fff}
.ce-upload{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:40px;text-align:center}
.ce-upload p{margin:0;font-size:16px;color:#50575e}
.ce-error{color:#d63638}
.ce-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #dcdcde}
@media (max-width:782px){.ce-modal{padding:0}.ce-modal-body{flex-direction:column}.ce-details{width:auto;border-left:0;border-top:1px solid #dcdcde}}
`;

/** Styles inside the visual editor's frame: text as on a classic theme, aligned images, placeholders. */
export const CONTENT_CSS = `
body{max-width:840px;margin:9px 10px;color:#1d2327;font-family:Georgia,"Times New Roman","Bitstream Charter",Times,serif;font-size:16px;line-height:1.5}
a{color:#0073aa}
img{max-width:100%;height:auto}
img.alignleft,figure.alignleft{float:left;margin:.5em 1em .5em 0}
img.alignright,figure.alignright{float:right;margin:.5em 0 .5em 1em}
img.aligncenter,figure.aligncenter{display:block;margin-left:auto;margin-right:auto}
figure.ce-image{display:table;margin:0 0 1em}
figure.ce-image.aligncenter{margin-left:auto;margin-right:auto}
figure.ce-image figcaption{display:table-caption;caption-side:bottom;padding:4px 0;font-size:13px;color:#50575e;text-align:center}
blockquote{margin:1em 0;padding-left:1em;border-left:4px solid #dcdcde;color:#50575e}
blockquote cite{display:block;font-style:normal;font-size:13px}
pre{padding:8px;background:#f6f7f7;font-family:Consolas,Monaco,monospace;font-size:14px;white-space:pre-wrap}
table{border-collapse:collapse;width:100%}
td,th{border:1px solid #dcdcde;padding:4px 8px}
hr{border:0;border-top:2px solid #dcdcde;margin:1.5em 0}
.ce-block{clear:both;margin:1em 0;padding:14px 16px;border:1px dashed #8c8f94;background:#f6f7f7;color:#50575e;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;cursor:default;user-select:none}
.ce-block::before{content:"\\25A6";margin-right:8px;color:#8c8f94}
.ce-more{clear:both;display:flex;align-items:center;gap:8px;margin:1.5em 0;font:11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-transform:uppercase;letter-spacing:.05em;color:#8c8f94;cursor:default;user-select:none}
.ce-more::before,.ce-more::after{content:"";flex:1;border-top:1px dashed #8c8f94}
`;
