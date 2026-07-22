import { PINYIN_FONT_URI, FONT_LIST } from './fontManager.js';

export async function printToPDF() {
    try {
        var gridDiv = document.getElementById('grid-container');
        var input = document.getElementById('inputText').value;
        if (!input.trim()) { alert('请先输入汉字并生成字帖'); return; }

        var selectedFont = document.getElementById('font-select').value;
        var totalPages = Math.ceil(input.length / 11);

        // 获取字体显示名
        var fontSelect = document.getElementById('font-select');
        var fontDisplayName = fontSelect.options[fontSelect.selectedIndex].text;

        // 获取页眉页脚
        var hLeft = document.getElementById('headerLeft').value || (function(){
            var now = new Date();
            return now.getFullYear() + '年' + (now.getMonth()+1).toString().padStart(2,'0') + '月' + now.getDate().toString().padStart(2,'0') + '日 ' + now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
        })();
        var hCenter = document.getElementById('headerCenter').value || '练习字帖';
        var hRight = document.getElementById('headerRight').value || fontDisplayName + '字体';
        var footerText = document.getElementById('footerText').value || '评分：☆☆☆☆☆';

        var rows = gridDiv.querySelectorAll('.row');
        var pageContent = '';
        for (var page = 0; page < totalPages; page++) {
            var startIdx = page * 22;
            var endIdx = Math.min(startIdx + 22, rows.length);
            var pageRows = '';
            for (var i = startIdx; i < endIdx; i++) {
                pageRows += rows[i].outerHTML;
            }
            pageContent += '<div class="page">' +
                '<div class="header">' +
                    '<span class="hl">' + hLeft + '</span>' +
                    '<span class="hc">' + hCenter + '</span>' +
                    '<span class="hr">' + hRight + ' · 第 ' + (page+1) + ' 页共 ' + totalPages + ' 页</span>' +
                '</div>' +
                '<div class="grid-container">' + pageRows + '</div>' +
                '<div class="footer">' + footerText + '</div>' +
            '</div>';
        }

        var htmlContent = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
            '@page{margin:20px;size:A4 portrait;background-color:white}' +
            '@font-face{font-family:LXGWWenKai;src:url(./fonts/LXGWWenKai-Regular.ttf)format("truetype")}' +
            '@font-face{font-family:TeXGyreAdventor;src:url(' + PINYIN_FONT_URI + ')format("opentype");font-display:swap}' +
            '@font-face{font-family:LXGWWenKaiLight;src:url(./fonts/LXGWWenKai-Light.ttf)format("truetype")}' +
            '@font-face{font-family:SourceHanSerifSC;src:url(./fonts/SourceHanSerifSC-Regular.otf)format("opentype")}' +
            '@font-face{font-family:TW-Kai;src:url(./fonts/TW-Kai.ttf)format("truetype")}' +
            '@font-face{font-family:WoYiQingChenTiKaiShu;src:url(./fonts/我逸清晨体楷书.ttf)format("truetype")}' +
            'html,body{font-family:TeXGyreAdventor,"' + selectedFont + '",serif;text-align:center;padding:0;margin:0;background:#fff}' +
            '.page{page-break-after:always;position:relative;width:100%;padding-top:30px;padding-bottom:40px}' +
            '.header{position:absolute;top:10px;left:0;width:100%;display:flex;justify-content:space-between;padding:0 20px;font-size:13px;color:#339933;z-index:2}' +
            '.header .hl{flex:1;text-align:left}' +
            '.header .hc{flex:1;text-align:center;font-weight:600}' +
            '.header .hr{flex:1;text-align:right}' +
            '.footer{position:fixed;bottom:15px;left:0;width:100%;text-align:center;color:#339933;font-size:13px;z-index:2}' +
            '.grid-container{display:flex;flex-direction:column;align-items:center;margin-top:20px}' +
            '.row{display:flex;position:relative;width:660px}' +
            '.pinyin-row{height:28.8px;display:flex;align-items:center}' +
            '.pinyin-cell{width:60px;height:28.8px;display:flex;justify-content:center;align-items:center}' +
            '.stroke-container{display:flex;flex-wrap:nowrap;overflow-x:auto;height:28.8px;align-items:center;margin-left:6px}' +
            '.stroke-svg{width:18.72px;height:18.72px;margin-right:4.68px;z-index:1}' +
            '.pinyin-row.page-first::before{content:"";position:absolute;width:660px;height:0;left:0;top:0;border:0.15px solid #339933;z-index:0}' +
            '.pinyin-row::after{content:"";position:absolute;width:660px;height:0;left:0;bottom:0;border:0.15px solid #339933;z-index:0}' +
            '.pinyin-row .line1,.pinyin-row .line2{content:"";position:absolute;height:0;border:0.15px solid #339933;z-index:0;opacity:0.25;width:60px;left:0}' +
            '.pinyin-row .line1{top:9.6px;border-style:dashed}' +
            '.pinyin-row .line2{top:19.2px}' +
            '.pinyin-cell span{font-family:TeXGyreAdventor!important;font-size:16.8px;position:relative;z-index:1}' +
            '.black span{color:black;opacity:1}.gray span{color:#ccc;opacity:0.35}' +
            '.char-row{margin-top:-1px;border-bottom:0.15px solid #339933}' +
            '.cell{width:60px;height:60px;border-right:0.15px solid #339933;border-left:0.15px solid #339933;position:relative;display:flex;justify-content:center;align-items:center;font-size:43.2px}' +
            '.cell:not(:first-child){border-left:none}.char-row .cell{border-top:0.15px solid #339933}' +
            '.cell::before,.cell::after{content:"";position:absolute;border:0.15px dashed #339933;z-index:0;opacity:0.5}' +
            '.cell::before{width:100%;height:0;top:50%;left:0;transform:translateY(-50%)}' +
            '.cell::after{width:0;height:100%;left:50%;top:0;transform:translateX(-50%)}' +
            '.diagonal1,.diagonal2{position:absolute;width:80px;height:0;border:0.15px dashed #339933;z-index:0;opacity:0.25}' +
            '.diagonal1{top:0;left:0;transform:rotate(48deg);transform-origin:0 0}' +
            '.diagonal2{bottom:0;left:0;transform:rotate(-48deg);transform-origin:0 100%}' +
            '.cell span{position:relative;z-index:1}' +
            '.tianzi-cell{width:60px;height:60px;position:relative;display:grid;grid-template-columns:repeat(2,30px);grid-template-rows:repeat(2,30px);border:0.15px solid #339933}' +
            '.tianzi-cell::before,.tianzi-cell::after{content:"";position:absolute;border:0.15px dashed #339933;opacity:0.5}' +
            '.tianzi-cell::before{width:100%;height:0;top:50%;left:0;transform:translateY(-50%)}' +
            '.tianzi-cell::after{width:0;height:100%;left:50%;top:0;transform:translateX(-50%)}' +
            '.tianzi-cell .sub-cell{display:flex;justify-content:center;align-items:center;font-size:30px;transform:scale(0.9)}' +
            '.tianzi-cell .sub-cell.top{font-family:TeXGyreAdventor,serif;font-size:12px}' +
            '.tianzi-cell .black-char{position:absolute;bottom:0;width:30px;height:30px;display:flex;justify-content:center;align-items:center;font-size:24px;color:black;opacity:1;z-index:1}' +
            '.tianzi-cell .black-char.left{left:0}.tianzi-cell .black-char.right{left:30px}' +
            '.tianzi-cell .red-char{position:absolute;top:0;left:0;width:60px;height:60px;display:flex;justify-content:center;align-items:center;font-size:43.2px;color:red;opacity:0.06;z-index:1}' +
            '</style></head><body>' + pageContent + '</body></html>';

        // 注入 <base> 让 about:blank 窗口能解析 ./fonts/ 相对路径
        var baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
        htmlContent = htmlContent.replace('<head>', '<head><base href="' + baseUrl + '">');

        var printWindow = window.open('', '_blank', 'width=900,height=700');
        printWindow.document.write(htmlContent);
        printWindow.document.close();

        // 加载提示
        var loadingMsg = printWindow.document.createElement('div');
        loadingMsg.id = 'pdf-loading-msg';
        loadingMsg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:24px 48px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border-radius:14px;font-size:16px;z-index:99999;box-shadow:0 8px 32px rgba(245,158,11,0.3);font-family:sans-serif';
        loadingMsg.innerHTML = '<div style="text-align:center"><div style="font-size:28px;margin-bottom:8px">⏳</div>正在加载字体，请稍候...</div>';
        printWindow.document.body.appendChild(loadingMsg);

        // 注入字体加载+自动打印脚本
        var s = printWindow.document.createElement('script');
        s.textContent = '(async function(){' +
            'var fl=[["LXGWWenKai","./fonts/LXGWWenKai-Regular.ttf"],' +
            '["TeXGyreAdventor","' + PINYIN_FONT_URI + '"],' +
            '["LXGWWenKaiLight","./fonts/LXGWWenKai-Light.ttf"],' +
            '["SourceHanSerifSC","./fonts/SourceHanSerifSC-Regular.otf"],' +
            '["TW-Kai","./fonts/TW-Kai.ttf"],' +
            '["WoYiQingChenTiKaiShu","./fonts/我逸清晨体楷书.ttf"]];' +
            'var loaded=0,failed=0,failedList=[];' +
            'for(var i=0;i<fl.length;i++){' +
                'try{' +
                    'var f=new FontFace(fl[i][0],"url("+fl[i][1]+")");' +
                    'await Promise.race([f.load(),new Promise(function(_,reject){setTimeout(function(){reject(new Error("timeout"))},5000)})]);' +
                    'document.fonts.add(f);loaded++;' +
                '}catch(e){' +
                    'console.warn("字体加载失败:"+fl[i][0]+" ("+e.message+")");' +
                    'failed++;failedList.push(fl[i][0]);' +
                '}' +
            '}' +
            'await document.fonts.ready;' +
            'var pinyinOk=document.fonts.check("16px TeXGyreAdventor");' +
            'var cnOk=document.fonts.check("16px LXGWWenKai");' +
            'if(!pinyinOk||!cnOk){' +
                'console.warn("关键字体未就绪，额外等待3秒重试...");' +
                'await new Promise(function(r){setTimeout(r,3000)});' +
                'await document.fonts.ready;' +
                'pinyinOk=document.fonts.check("16px TeXGyreAdventor");' +
                'cnOk=document.fonts.check("16px LXGWWenKai");' +
            '}' +
            'console.log("字体加载完成: 成功"+loaded+"个"+(failed>0?", 失败"+failed+"个("+failedList.join(",")+")":"")+" | 拼音字体:"+(pinyinOk?"就绪":"未就绪")+" | 汉字字体:"+(cnOk?"就绪":"未就绪"));' +
            'var lm=document.getElementById("pdf-loading-msg");if(lm)lm.remove();' +
            'window.print();' +
            '})();';
        printWindow.document.head.appendChild(s);
    } catch (error) {
        console.error('PDF生成错误:', error);
        alert('生成PDF时出错: ' + error.message);
    }
}
