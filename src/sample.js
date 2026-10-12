const SAMPLE_DOC = `
<p style="text-align:center;line-height:1.4"><span style="font-family:'함초롬돋움','Noto Sans KR',sans-serif;font-size:20pt;font-weight:bold">HWP 편집실 사용 안내</span></p>
<p style="text-align:center"><span style="font-size:9pt;color:#5b6578">이 문서는 처음 화면에 보이는 예시입니다. 마음껏 고쳐 보고 저장해 보세요.</span></p>
<p><br></p>
<p><span style="font-family:'함초롬돋움','Noto Sans KR',sans-serif;font-size:12pt;font-weight:bold;color:#1f4fbf">1. 문서 열기</span></p>
<p style="margin-left:18.9px">위쪽의 <b>열기</b> 단추를 누르거나 파일을 이 화면에 끌어다 놓으면 됩니다. 한글 문서(<b>.hwp</b>, <b>.hwpx</b>)와 Word(.docx), 웹페이지, 텍스트, 마크다운 파일을 열 수 있습니다.</p>
<p style="margin-left:18.9px">HWP 파일은 먼저 빠른 변환으로 열고, 표나 그림이 어긋나 보이면 아래 상태줄의 <span style="background-color:#fff3a3">정밀 변환으로 다시 열기</span>를 누르세요.</p>
<p><br></p>
<p><span style="font-family:'함초롬돋움','Noto Sans KR',sans-serif;font-size:12pt;font-weight:bold;color:#1f4fbf">2. 저장과 내보내기</span></p>
<table class="hwp-table" style="width:566px"><colgroup><col style="width:120px"><col style="width:110px"><col style="width:336px"></colgroup>
<tr><td style="background-color:#ddebf7;text-align:center"><p style="text-align:center"><b>형식</b></p></td><td style="background-color:#ddebf7"><p style="text-align:center"><b>확장자</b></p></td><td style="background-color:#ddebf7"><p style="text-align:center"><b>쓰임</b></p></td></tr>
<tr><td><p style="text-align:center">한글 문서</p></td><td><p style="text-align:center">.hwpx</p></td><td><p>기본 저장 형식. 한글 2014 이상에서 바로 열립니다. (Ctrl+S)</p></td></tr>
<tr><td><p style="text-align:center">한글 문서</p></td><td><p style="text-align:center">.hwp</p></td><td><p>예전 한글 형식. 처음 한 번 변환 엔진을 내려받습니다.</p></td></tr>
<tr><td><p style="text-align:center">Word</p></td><td><p style="text-align:center">.docx</p></td><td><p>MS Word, 구글 문서, 한글에서 모두 열립니다.</p></td></tr>
<tr><td><p style="text-align:center">PDF</p></td><td><p style="text-align:center">.pdf</p></td><td><p>쪽 모양 그대로 보낼 때. 글자 선택이 필요하면 <b>인쇄 → PDF로 저장</b>을 쓰세요.</p></td></tr>
<tr><td><p style="text-align:center">그 밖에</p></td><td><p style="text-align:center">.html .md .txt .png</p></td><td><p>웹페이지, 노션용 마크다운, 글자만, 쪽별 그림</p></td></tr>
</table>
<p><br></p>
<p><span style="font-family:'함초롬돋움','Noto Sans KR',sans-serif;font-size:12pt;font-weight:bold;color:#1f4fbf">3. 알아 두면 좋은 단축키</span></p>
<p style="margin-left:18.9px">· Ctrl+S 저장 &nbsp; · Ctrl+O 열기 &nbsp; · Ctrl+F 찾기 &nbsp; · Ctrl+H 바꾸기</p>
<p style="margin-left:18.9px">· Ctrl+Enter 쪽 나누기 &nbsp; · 표 안에서 Tab 다음 칸 (마지막 칸이면 줄 추가)</p>
<p style="margin-left:18.9px">· Ctrl+] / Ctrl+[ 글자 크게·작게</p>
<p><br></p>
<p><span style="font-family:'함초롬돋움','Noto Sans KR',sans-serif;font-size:12pt;font-weight:bold;color:#1f4fbf">4. 지켜지는 것과 빠지는 것</span></p>
<p style="margin-left:18.9px">글꼴·크기·진하게·기울임·밑줄·취소선·글자색·음영, 문단 정렬·줄 간격·여백, 표(셀 합치기·배경색), 그림, 쪽 나누기, 용지 크기와 여백은 저장할 때 그대로 옮겨집니다.</p>
<p style="margin-left:18.9px">머리말·꼬리말, 각주, 쪽 번호, 도형·글맵시, 차트, 다단, 변경 내용 추적은 아직 편집하거나 저장할 수 없습니다. 이런 요소가 많은 원본은 <span style="color:#c0392b"><b>다른 이름으로 저장</b></span>해서 원본을 남겨 두세요.</p>
<p><br></p>
<p style="text-align:right"><span style="font-size:9pt;color:#5b6578">고친 내용은 이 브라우저에 자동 보관되어, 창을 실수로 닫아도 다시 열면 이어서 편집할 수 있습니다.</span></p>
`;
