(() => {
  const records = window.CET6_DATA || [];
  const $ = (selector) => document.querySelector(selector);
  const list = $("#paperList");
  const audio = $("#audio");
  const content = $("#content");
  const state = { currentId: localStorage.getItem("cet6-current") || records[0]?.id, tab: "transcript", completed: new Set(JSON.parse(localStorage.getItem("cet6-completed") || "[]")), query: "", submitted: false };
  const escapeHtml = (text = "") => text.replace(/[&<>]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[char]));
  const renderMarkdown = (text) => escapeHtml(text).split("\n").map((line) => /^#\s+/.test(line) ? `<h2>${line.replace(/^#\s+/, "")}</h2>` : /^##\s+/.test(line) ? `<h3>${line.replace(/^##\s+/, "")}</h3>` : line).join("\n");
  const current = () => records.find((record) => record.id === state.currentId) || records[0];
  const titleOf = (record) => `${record.session.replace(".", " 年 ")} 月 · 第 ${record.set} 套`;
  const answerKey = (id) => `cet6-user-answers-${id}`;
  const resultKey = (id) => `cet6-result-${id}`;
  const attemptKey = (id) => `cet6-attempts-${id}`;
  const getAnswers = () => JSON.parse(localStorage.getItem(answerKey(state.currentId)) || "{}");

  function saveProgress() { localStorage.setItem("cet6-current", state.currentId); localStorage.setItem("cet6-completed", JSON.stringify([...state.completed])); }
  function renderList() {
    const filtered = records.filter((record) => titleOf(record).includes(state.query));
    list.innerHTML = filtered.map((record) => `<button class="paper-button ${record.id === state.currentId ? "active" : ""} ${state.completed.has(record.id) ? "done" : ""}" data-id="${record.id}"><span>${titleOf(record)}</span><i class="done-dot"></i></button>`).join("") || `<div class="empty">没有匹配的试卷</div>`;
    const done = state.completed.size;
    $("#progressText").textContent = `${done} / ${records.length} 已完成`;
    $("#progressBar").style.width = `${records.length ? done / records.length * 100 : 0}%`;
  }
  function quizScore(record, answers) { const graded = record.quiz.filter((question) => question.correct); return { score: graded.reduce((sum, question) => sum + (answers[question.number] === question.correct ? 1 : 0), 0), total: graded.length }; }
  function renderQuiz() {
    const record = current();
    if (!record.quiz.length) { content.className = "content question-content"; content.innerHTML = '<div class="empty"><strong>本套暂缺可作答题目</strong><br>仍可使用音频和听力原文练习。</div>'; $("#quizActions").hidden = true; return; }
    const answers = getAnswers();
    const savedResult = JSON.parse(localStorage.getItem(resultKey(record.id)) || "null");
    state.submitted = Boolean(savedResult);
    const result = state.submitted ? `<div class="score-card"><div><span>本次得分</span><strong>${savedResult.score}<small> / ${savedResult.total}</small></strong></div><p>正确率 ${savedResult.total ? Math.round(savedResult.score / savedResult.total * 100) : 0}% · ${savedResult.time}</p></div>` : "";
    const questions = record.quiz.map((question) => {
      const selected = answers[question.number];
      const optionHtml = question.options.map((option) => {
        const isSelected = selected === option.letter;
        const isCorrect = state.submitted && Boolean(question.correct) && option.letter === question.correct;
        const isWrong = state.submitted && Boolean(question.correct) && isSelected && option.letter !== question.correct;
        return `<label class="quiz-option${isSelected ? " selected" : ""}${isCorrect ? " correct" : ""}${isWrong ? " wrong" : ""}"><input type="radio" name="q${question.number}" value="${option.letter}" ${isSelected ? "checked" : ""} ${state.submitted ? "disabled" : ""}><b>${option.letter}</b><span>${escapeHtml(option.text)}</span>${isCorrect ? '<em>正确答案</em>' : ""}</label>`;
      }).join("");
      return `<section class="quiz-question" data-question="${question.number}"><header><strong>第 ${question.number} 题</strong><span>${question.correct ? "题干请听录音" : "标准答案缺失，本题不计分"}</span></header>${optionHtml}</section>`;
    }).join("");
    content.className = "content question-content quiz-content";
    content.innerHTML = result + questions;
    $("#quizActions").hidden = false;
    updateAnswerCount();
    $("#submitQuiz").textContent = state.submitted ? "重新答题" : "提交答卷";
  }
  function renderAnswerSheet() {
    const record = current(); const answers = getAnswers();
    const savedResult = JSON.parse(localStorage.getItem(resultKey(record.id)) || "null");
    const grid = record.quiz.map((question) => { const mine = answers[question.number]; const status = !question.correct || !mine ? "blank" : mine === question.correct ? "right" : "miss"; return `<div class="answer-chip ${status}"><b>${question.number}</b><span>${question.correct || "—"}</span>${mine && question.correct && mine !== question.correct ? `<small>你选 ${mine}</small>` : ""}</div>`; }).join("");
    content.className = "content answer-content";
    content.innerHTML = `${savedResult ? `<div class="answer-summary">最近成绩：<strong>${savedResult.score} / ${savedResult.total}</strong><span>${savedResult.time}</span></div>` : '<div class="answer-summary">还没有提交答卷，以下为标准答案。</div>'}<div class="answer-grid">${grid}</div>`;
  }
  function renderContent() {
    const record = current(); $("#quizActions").hidden = true;
    $("#focusMode").closest("label").style.display = state.tab === "transcript" ? "flex" : "none";
    if (state.tab === "questions") { $("#studyHint").textContent = "边听边选择答案，系统会自动保存；提交后立即评分。"; renderQuiz(); return; }
    if (state.tab === "answers") { $("#studyHint").textContent = "绿色为答对，红色为答错；回到原文定位错题对应句。"; renderAnswerSheet(); return; }
    content.className = `content transcript-content${$("#focusMode").checked ? " focused" : ""}`;
    content.innerHTML = renderMarkdown(record?.transcript || "暂无内容。");
    $("#studyHint").textContent = "先听一遍，再打开原文核对。开启“精听遮挡”可减少偷看。";
  }
  function updateAnswerCount() { const total = current()?.quiz.length || 0; const answered = Object.keys(getAnswers()).length; $("#answerCount").textContent = state.submitted ? `已完成 ${total} 题` : `已答 ${answered} / ${total}`; }
  function submitQuiz() {
    const record = current();
    if (state.submitted) { localStorage.removeItem(answerKey(record.id)); localStorage.removeItem(resultKey(record.id)); state.submitted = false; renderQuiz(); return; }
    const answers = getAnswers(); const grade = quizScore(record, answers);
    const result = { score: grade.score, total: grade.total, time: new Date().toLocaleString("zh-CN", {month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}) };
    localStorage.setItem(resultKey(record.id), JSON.stringify(result));
    const attempts = JSON.parse(localStorage.getItem(attemptKey(record.id)) || "[]"); attempts.push(result); localStorage.setItem(attemptKey(record.id), JSON.stringify(attempts.slice(-10)));
    state.submitted = true; if (grade.total > 0 && grade.score === grade.total) state.completed.add(record.id);
    saveProgress(); renderList(); renderQuiz(); content.scrollIntoView({behavior:"smooth", block:"start"});
  }
  function selectRecord(id, preserveTime = false) {
    const record = records.find((item) => item.id === id); if (!record) return;
    state.currentId = id; state.submitted = Boolean(localStorage.getItem(resultKey(id)));
    const savedTime = Number(localStorage.getItem(`cet6-time-${id}`) || 0);
    $("#paperTitle").textContent = titleOf(record); $("#audioLabel").textContent = `${record.session} · Set ${record.set}`; audio.src = encodeURI(record.audio);
    audio.onloadedmetadata = () => { if (!preserveTime && savedTime > 0 && savedTime < audio.duration - 5) audio.currentTime = savedTime; };
    const done = state.completed.has(id); $("#completeButton").classList.toggle("done", done); $("#completeLabel").textContent = done ? "已完成" : "标记完成";
    renderList(); renderContent(); saveProgress(); $("#sidebar").classList.remove("open"); $("#scrim").classList.remove("open");
  }
  list.addEventListener("click", (event) => { const button = event.target.closest("[data-id]"); if (button) selectRecord(button.dataset.id); });
  $("#search").addEventListener("input", (event) => { state.query = event.target.value.trim().replace("-", "."); renderList(); });
  $(".tabs").addEventListener("click", (event) => { const button = event.target.closest("[data-tab]"); if (!button) return; state.tab = button.dataset.tab; document.querySelectorAll("[data-tab]").forEach((item) => item.classList.toggle("active", item === button)); renderContent(); });
  $("#focusMode").addEventListener("change", renderContent);
  content.addEventListener("click", () => { if (content.classList.contains("focused")) { $("#focusMode").checked = false; renderContent(); } });
  content.addEventListener("change", (event) => { if (!event.target.matches('input[type="radio"]') || state.submitted) return; const number = event.target.closest(".quiz-question").dataset.question; const answers = getAnswers(); answers[number] = event.target.value; localStorage.setItem(answerKey(state.currentId), JSON.stringify(answers)); event.target.closest(".quiz-question").querySelectorAll(".quiz-option").forEach((option) => option.classList.toggle("selected", option.contains(event.target))); updateAnswerCount(); });
  $("#submitQuiz").addEventListener("click", submitQuiz);
  $("#speedControls").addEventListener("click", (event) => { const button = event.target.closest("[data-speed]"); if (!button) return; audio.playbackRate = Number(button.dataset.speed); document.querySelectorAll("[data-speed]").forEach((item) => item.classList.toggle("active", item === button)); });
  $("#completeButton").addEventListener("click", () => { const id = state.currentId; state.completed.has(id) ? state.completed.delete(id) : state.completed.add(id); selectRecord(id, true); });
  audio.addEventListener("timeupdate", () => { if (state.currentId && Math.floor(audio.currentTime) % 5 === 0) localStorage.setItem(`cet6-time-${state.currentId}`, String(audio.currentTime)); });
  $("#menuButton").addEventListener("click", () => { $("#sidebar").classList.add("open"); $("#scrim").classList.add("open"); });
  $("#scrim").addEventListener("click", () => { $("#sidebar").classList.remove("open"); $("#scrim").classList.remove("open"); });
  function registerWebMcp() { const context = document.modelContext; if (!context?.registerTool) return; context.registerTool({name:"open_listening_paper",title:"打开六级听力试卷",description:"按试卷 ID 打开一套六级听力资料。",inputSchema:{type:"object",properties:{id:{type:"string"}},required:["id"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute({id}){if(!records.some(r=>r.id===id))throw new Error("未知试卷 ID");selectRecord(id);return {id,title:titleOf(current())};}}); context.registerTool({name:"score_listening_answers",title:"计算六级听力得分",description:"计算当前试卷已选择答案的得分。",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(){const record=current();const answers=getAnswers();const grade=quizScore(record,answers);return {id:record.id,answered:Object.keys(answers).length,score:grade.score,total:grade.total};}}); }
  if (records.length) selectRecord(state.currentId); else content.innerHTML = '<div class="empty">未找到听力资料。</div>'; registerWebMcp();
})();
