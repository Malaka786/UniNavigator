(function () {
  // If the UI is opened from file:// or another dev server port,
  // fall back to the backend origin so API calls still work.
  const API =
    window.location.protocol === "file:" ||
    (window.location.hostname === "localhost" && window.location.port && window.location.port !== "3000")
      ? "http://localhost:3000"
      : "";

  let currentUser = null;

  let gpaChart = null;
  let dashboardAttendanceChart = null;
  let dashboardRepeatChart = null;
  let pageAttendanceChart = null;
  let tasksChart = null;
  let pageRepeatBarChart = null;
  let repeatPieChart = null;
  let adminUsageChart = null;
  let adminHallMap = null;
  let adminHallMarker = null;
  let adminHallCircle = null;
  let attendanceUniversities = [];
  let attendanceHalls = [];
  let selectedAttendanceUniversityId = null;

  const GRADE_POINTS = {
    "A+": 4.0, "A": 4.0, "A-": 3.7,
    "B+": 3.3, "B": 3.0, "B-": 2.7,
    "C+": 2.3, "C": 2.0, "C-": 1.7,
    "D": 1.0, "E": 0.5, "F": 0
  };

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function parsePositiveInt(value, fallback = null) {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1) return fallback;
    return n;
  }

  function normalizeCode(code) {
    return (code || "").trim().toUpperCase();
  }

  function isGradeBelowC(gradeLetter) {
    if (!gradeLetter) return false;
    const gp = GRADE_POINTS[gradeLetter];
    return gp != null && gp < 2.0;
  }

  function showFormError(formOrId, msg) {
    const el = typeof formOrId === "string" ? document.getElementById(formOrId) : formOrId;
    if (!el) return;
    let errEl = el.querySelector(".validation-error");
    if (!errEl) {
      errEl = document.createElement("div");
      errEl.className = "validation-error error-msg";
      el.insertBefore(errEl, el.firstChild);
    }
    errEl.textContent = msg;
    errEl.classList.remove("hidden");
  }

  function clearFormError(formOrId) {
    const el = typeof formOrId === "string" ? document.getElementById(formOrId) : formOrId;
    const errEl = el?.querySelector(".validation-error");
    if (errEl) errEl.classList.add("hidden");
  }

  // ==============================
  // API Helpers
  // ==============================

  async function get(url) {
    const res = await fetch(API + url, { credentials: "include" });
    return await res.json();
  }

  async function post(url, data) {
    const res = await fetch(API + url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });
    return await res.json();
  }

  async function put(url, data) {
    const res = await fetch(API + url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });
    return await res.json();
  }

  async function patch(url, data) {
    const res = await fetch(API + url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });
    return await res.json();
  }

  async function del(url) {
    await fetch(API + url, { method: "DELETE", credentials: "include" });
  }

  // ==============================
  // Usage analytics helpers
  // ==============================

  async function trackUsage(event_type, page, meta) {
    if (!currentUser) return;
    const payload = {
      user_id: currentUser.id,
      event_type,
      page: page || null,
      meta: meta || null,
    };
    try {
      await fetch(API + "/analytics/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: "include",
      });
    } catch (_) {}
  }

  // Distance between lat/lng points (meters)
  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // earth radius
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ==============================
  // Auth & Navigation
  // ==============================

  async function login(e) {
    e.preventDefault();
    const email = document.getElementById("login-email").value?.trim() || "";
    const password = document.getElementById("login-password").value || "";
    const authError = document.getElementById("auth-error");
    if (authError) authError.classList.add("hidden");
    if (!email || !password) {
      if (authError) { authError.textContent = "Email and password are required"; authError.classList.remove("hidden"); }
      return;
    }
    const user = await post("/login", { email, password });
    if (!user || user.error) {
      const el = document.getElementById("auth-error");
      if (el) { el.textContent = user?.error || "Invalid login"; el.classList.remove("hidden"); }
      return;
    }
    currentUser = user;
    showApp();
  }

  async function tryResumeSession() {
    try {
      const res = await get("/me");
      if (res && res.user && res.user.id) {
        currentUser = res.user;
        showApp();
      }
    } catch (_) {}
  }

  async function register(e) {
    e.preventDefault();
    const name = (document.getElementById("reg-name").value || "").trim();
    const email = (document.getElementById("reg-email").value || "").trim();
    const password = document.getElementById("reg-password").value || "";
    const regError = document.getElementById("register-error");
    if (regError) regError.classList.add("hidden");
    if (!name || name.length > 255) {
      if (regError) { regError.textContent = "Name is required (1–255 characters)"; regError.classList.remove("hidden"); }
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      if (regError) { regError.textContent = "Enter a valid email address"; regError.classList.remove("hidden"); }
      return;
    }
    if (!password || password.length < 6) {
      if (regError) { regError.textContent = "Password must be at least 6 characters"; regError.classList.remove("hidden"); }
      return;
    }
    const result = await post("/register", { name, email, password });
    if (result.error) {
      const el = document.getElementById("register-error");
      if (el) { el.textContent = result.error; el.classList.remove("hidden"); }
      return;
    }
    alert("Registration successful! Sign in with your email.");
    document.getElementById("show-login").click();
  }

  const deadlineNotifiedIds = new Set();

  function showApp() {
    document.getElementById("auth-screen").classList.add("hidden");
    document.getElementById("register-screen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");

    const sidebarName = document.getElementById("sidebar-name");
    const sidebarEmail = document.getElementById("sidebar-email");
    if (sidebarName) sidebarName.textContent = currentUser.name || "Student";
    if (sidebarEmail) sidebarEmail.textContent = currentUser.email || "";

    const isAdmin = currentUser?.role === "admin";
    document.querySelectorAll(".admin-only").forEach((el) => {
      el.classList.toggle("hidden", !isAdmin);
    });
    document.querySelectorAll(".student-only").forEach((el) => {
      el.classList.toggle("hidden", isAdmin);
    });

    initNavigation();

    if (isAdmin) {
      showPage("admin-dashboard");
      loadAdminDashboard();
      loadAdminUsers();
      loadAdminUniversitiesForHalls();
      loadAdminConcerns();
      // Timetable uploads are handled by students only
      loadAdminUsage();
    } else {
      loadDashboard();
      loadAttendance();
      loadRepeat();
      loadTasks();
      showPage("dashboard");
      checkUpcomingDeadlines();
      if (window.deadlineCheckInterval) clearInterval(window.deadlineCheckInterval);
      window.deadlineCheckInterval = setInterval(checkUpcomingDeadlines, 30 * 60 * 1000);
    }
  }

  function showDeadlinePrefsSaved() {
    const el = document.getElementById("save-notification-prefs");
    if (!el) return;
    const orig = el.textContent;
    el.textContent = "Saved!";
    setTimeout(() => { el.textContent = orig; }, 1500);
  }

  async function checkUpcomingDeadlines() {
    if (!currentUser || currentUser.notify_deadlines === false) return;
    const days = Math.min(30, Math.max(1, parseInt(currentUser.deadline_reminder_days, 10) || 3));
    let tasks = [];
    try {
      tasks = await get("/users/" + currentUser.id + "/tasks");
    } catch (_) {}
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = tasks.filter((t) => {
      if (t.completed || !t.due_date) return false;
      const due = new Date(t.due_date);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= days;
    });
    if (upcoming.length === 0) {
      const banner = document.getElementById("deadline-alert-banner");
      if (banner) { banner.classList.add("hidden"); banner.innerHTML = ""; }
      return;
    }
    const toNotify = upcoming.filter((t) => !deadlineNotifiedIds.has(t.id));
    const banner = document.getElementById("deadline-alert-banner");
    if (banner) {
      banner.classList.remove("hidden");
      const list = upcoming.slice(0, 5).map((t) => {
        const due = new Date(t.due_date);
        const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
        const dayText = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff + " days";
        return `<span class="deadline-alert-item">${t.title} — ${dayText}</span>`;
      }).join("");
      banner.innerHTML = `<span class="deadline-alert-icon"></span><span class="deadline-alert-msg">Deadlines soon: ${list}</span><a href="#" data-page="tasks" class="deadline-alert-link">View tasks</a>`;
      banner.querySelector(".deadline-alert-link")?.addEventListener("click", (e) => { e.preventDefault(); showPage("tasks"); });
    }
    if (toNotify.length > 0 && "Notification" in window && Notification.permission === "granted") {
      toNotify.forEach((t) => {
        deadlineNotifiedIds.add(t.id);
        const due = new Date(t.due_date);
        const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
        const when = diff === 0 ? "today" : diff === 1 ? "tomorrow" : "in " + diff + " days";
        new Notification("UniNavigator: Deadline soon", { body: t.title + " is due " + when, icon: "/favicon.ico" });
      });
    } else if (toNotify.length > 0) {
      toNotify.forEach((t) => deadlineNotifiedIds.add(t.id));
    }
  }

  function showPage(pageId) {
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
    const page = document.getElementById("page-" + pageId);
    const link = document.querySelector('.nav-link[data-page="' + pageId + '"]');
    if (page) page.classList.add("active");
    if (link) link.classList.add("active");

    trackUsage("page_view", pageId);

    if (pageId === "gpa") loadGpaPage();
    if (pageId === "attendance") loadAttendancePage();
    if (pageId === "tasks") loadTasks();
    if (pageId === "repeat") loadRepeat();
    if (pageId === "concerns") loadConcernsPage();

    if (pageId === "admin-dashboard") loadAdminDashboard();
    if (pageId === "admin-users") loadAdminUsers();
    if (pageId === "admin-halls") loadAdminHallsPage();
    if (pageId === "admin-concerns") loadAdminConcerns();
    if (pageId === "admin-usage") loadAdminUsage();
  }

  function initNavigation() {
    document.querySelectorAll(".nav-link[data-page]").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        showPage(link.getAttribute("data-page"));
      });
    });
  }

  // ==============================
  // Dashboard (Profile + Report + Goals + GPA)
  // ==============================

  async function loadDashboard() {
    if (!currentUser) return;

    const [gpaData, profile, timetables] = await Promise.all([
      get("/users/" + currentUser.id + "/gpa"),
      get("/users/" + currentUser.id + "/profile").catch(() => currentUser),
      get("/users/" + currentUser.id + "/timetables").catch(() => []),
    ]);

    const cgpa = gpaData.overall?.gpa ?? 0;
    const modulesAll = gpaData.modules || [];
    const currentSemester = Math.max(
      1,
      ...modulesAll.map((m) => {
        const s = parseInt(m.semester, 10);
        return isNaN(s) ? 1 : s;
      })
    );
    const currentSemesterModules = modulesAll.filter((m) => (parseInt(m.semester, 10) || 1) === currentSemester);
    const moduleCount = currentSemesterModules.length;
    const targetGpa = profile.target_gpa != null ? profile.target_gpa : "–";
    const targetAtt = profile.target_attendance != null ? profile.target_attendance : 80;

    document.getElementById("dashboard-name").textContent = profile.name || currentUser.name || "Student";
    document.getElementById("dashboard-index").textContent = profile.index_number ? "Index: " + profile.index_number : "–";
    document.getElementById("dashboard-email").textContent = profile.email || currentUser.email || "–";

    const picEl = document.getElementById("profile-pic");
    if (picEl && (profile.profile_pic || currentUser.profile_pic)) {
      picEl.src = profile.profile_pic || currentUser.profile_pic;
    }

    document.getElementById("dashboard-current-gpa").textContent = cgpa;
    document.getElementById("dashboard-target-gpa").textContent = targetGpa;
    document.getElementById("dashboard-target-attendance").textContent = targetAtt + "%";
    document.getElementById("dashboard-module-count").textContent = moduleCount;

    // Notification (deadline alerts) prefs
    const notifyCheckbox = document.getElementById("notify-deadlines-checkbox");
    const reminderDaysSelect = document.getElementById("deadline-reminder-days");
    const saveNotifBtn = document.getElementById("save-notification-prefs");
    if (notifyCheckbox) notifyCheckbox.checked = profile.notify_deadlines !== false && currentUser.notify_deadlines !== false;
    if (reminderDaysSelect) reminderDaysSelect.value = String(profile.deadline_reminder_days || currentUser.deadline_reminder_days || 3);
    if (saveNotifBtn) {
      saveNotifBtn.onclick = async () => {
        const enabled = notifyCheckbox ? notifyCheckbox.checked : true;
        const days = reminderDaysSelect ? parseInt(reminderDaysSelect.value, 10) : 3;
        if (enabled && "Notification" in window && Notification.permission === "default") {
          await Notification.requestPermission();
        }
        await put("/users/" + currentUser.id + "/profile", { notify_deadlines: enabled, deadline_reminder_days: days });
        currentUser.notify_deadlines = enabled;
        currentUser.deadline_reminder_days = days;
        showDeadlinePrefsSaved();
      };
    }

    // Goals edit
    const editBtn = document.getElementById("edit-goals-btn");
    const editFields = document.getElementById("goals-edit-fields");
    const saveBtn = document.getElementById("save-goals-btn");
    if (editBtn && editFields) {
      editBtn.onclick = () => {
        editFields.classList.toggle("hidden");
        if (!editFields.classList.contains("hidden")) {
          document.getElementById("edit-target-gpa").value = targetGpa !== "–" ? targetGpa : "";
          document.getElementById("edit-target-attendance").value = targetAtt !== "–" ? targetAtt : 80;
        }
      };
    }
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const tg = parseFloat(document.getElementById("edit-target-gpa").value);
        const ta = parseInt(document.getElementById("edit-target-attendance").value, 10);
        if (!isNaN(tg) && (tg < 0 || tg > 4)) {
          alert("Target GPA must be between 0 and 4");
          return;
        }
        if (!isNaN(ta) && (ta < 0 || ta > 100)) {
          alert("Target attendance must be between 0 and 100");
          return;
        }
        const res = await put("/users/" + currentUser.id + "/profile", {
          target_gpa: isNaN(tg) ? null : tg,
          target_attendance: isNaN(ta) ? 80 : ta,
        });
        if (res && res.error) {
          alert(res.error);
          return;
        }
        currentUser.target_gpa = tg;
        currentUser.target_attendance = ta;
        editFields.classList.add("hidden");
        loadDashboard();
      };
    }

    // Profile picture upload
    const uploadPic = document.getElementById("upload-pic");
    if (uploadPic) {
      uploadPic.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith("image/")) return;
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result;
          await put("/users/" + currentUser.id + "/profile", { profile_pic: base64 });
          currentUser.profile_pic = base64;
          if (picEl) picEl.src = base64;
        };
        reader.readAsDataURL(file);
      };
    }

    // GPA line chart
    const labels = (gpaData.modules || [])
      .filter((m) => m.grade_point != null)
      .map((m) => m.name);
    const grades = (gpaData.modules || [])
      .filter((m) => m.grade_point != null)
      .map((m) => parseFloat(m.grade_point));

    const gpaCtx = document.getElementById("gpaChart");
    if (gpaCtx) {
      if (gpaChart) gpaChart.destroy();
      gpaChart = new Chart(gpaCtx, {
        type: "line",
        data: {
          labels,
          datasets: [{ label: "Grade Points", data: grades, borderColor: "#00c9a7", tension: 0.2 }],
        },
        options: { responsive: true, maintainAspectRatio: true },
      });
    }

    // Dashboard attendance chart (from attendance logs: includes delivery_mode)
    const attData = await get("/users/" + currentUser.id + "/attendance-logs").catch(() => []);
    const attLabels = attData.map((a) => `${a.module_name}${a.delivery_mode === "online" ? " (Online)" : " (Physical)"}`);
    const attValues = attData.map((a) => Math.round((a.attended / (a.total_sessions || 1)) * 100));
    const dashAttCtx = document.getElementById("dashboard-attendanceChart");
    if (dashAttCtx) {
      if (dashboardAttendanceChart) dashboardAttendanceChart.destroy();
      dashboardAttendanceChart = new Chart(dashAttCtx, {
        type: "bar",
        data: {
          labels: attLabels,
          datasets: [
            {
              label: "Attendance %",
              data: attValues,
              backgroundColor: attData.map((a) => (a.delivery_mode === "online" ? "rgba(59,130,246,0.6)" : "rgba(0,201,167,0.6)")),
            },
          ],
        },
        options: { responsive: true, maintainAspectRatio: true },
      });
    }

    // Dashboard repeat chart (pie)
    const modules = gpaData.modules || [];
    const repeatCount = modules.filter((m) => m.is_repeat).length;
    const normalCount = modules.length - repeatCount;
    const dashRepeatCtx = document.getElementById("dashboard-repeatChart");
    if (dashRepeatCtx) {
      if (dashboardRepeatChart) dashboardRepeatChart.destroy();
      dashboardRepeatChart = new Chart(dashRepeatCtx, {
        type: "pie",
        data: {
          labels: ["Normal", "Repeat"],
          datasets: [{ data: [normalCount, repeatCount], backgroundColor: ["#00c9a7", "#f59e0b"] }],
        },
        options: { responsive: true, maintainAspectRatio: true },
      });
    }

    // Recent modules table
    const tbody = document.getElementById("dashboard-modules");
    const recent = currentSemesterModules.slice(-10).reverse();
    tbody.innerHTML = recent.length
      ? recent
          .map(
            (m) =>
              `<tr><td>${m.name}</td><td>${m.credits}</td><td>${m.grade_letter || "–"}</td><td>${m.semester || 1}</td></tr>`
          )
          .join("")
      : "<tr><td colspan=\"4\">No modules yet</td></tr>";

    // Timetables table
    const ttBody = document.getElementById("dashboard-timetables-tbody");
    if (ttBody) {
      const rows = timetables || [];
      ttBody.innerHTML = rows.length
        ? rows
            .map((t) => {
              const fileName = t.file_path ? String(t.file_path).split(/[\\\\/]/).pop() : "";
              const fileUrl = fileName ? "/uploads/" + fileName : null;
              return `
                <tr>
                  <td>${t.university_name || "—"}</td>
                  <td>${t.semester || "—"}</td>
                  <td>${t.academic_year || t.year_number || "—"}</td>
                  <td>${fileUrl ? `<a href="${fileUrl}" target="_blank">View PDF</a> | <a href="${fileUrl}" target="_blank" download>Download</a>` : "—"}</td>
                  <td>${t.created_at ? String(t.created_at).slice(0, 10) : "—"}</td>
                </tr>
              `;
            })
            .join("")
        : "<tr><td colspan=\"5\">No timetable uploads yet</td></tr>";
    }
  }

  // ==============================
  // GPA Calculator + Goal Planner
  // ==============================

  async function loadGpaPage() {
    if (!currentUser) return;
    const [gpaData, universities] = await Promise.all([
      get("/users/" + currentUser.id + "/gpa"),
      get("/universities").catch(() => []),
    ]);
    const modules = gpaData.modules || [];
    const semesters = gpaData.semesters || [];

    const cards = document.getElementById("gpa-summary-cards");
    const cgpa = gpaData.overall?.gpa ?? 0;
    const totalCredits = gpaData.overall?.credits ?? 0;
    cards.innerHTML = `
      <div class="card"><div class="label">Current GPA</div><div class="value">${cgpa}</div></div>
      <div class="card"><div class="label">Total Credits</div><div class="value">${totalCredits}</div></div>
      <div class="card"><div class="label">Semesters</div><div class="value">${semesters.length}</div></div>
    `;

    // Display semester-wise GPA
    const semesterContainer = document.getElementById("gpa-semester-container");
    if (semesterContainer) {
      semesterContainer.innerHTML = semesters.map(sem => {
        const year = Math.ceil(sem.semester / 2);
        const semInYear = sem.semester % 2 === 0 ? 2 : 1;
        return `
          <div class="semester-section">
            <h3>Year ${year} | Semester ${semInYear} | Semester GPA: ${sem.gpa}</h3>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>Code</th><th>Subject Name</th><th>Credits</th><th>CA%</th><th>Grade</th><th>Grade Points</th></tr>
                </thead>
                <tbody>
                  ${sem.modules.map(m => `
                    <tr>
                      <td>${m.code || '–'}</td>
                      <td>${m.name}</td>
                      <td>${m.credits}</td>
                      <td>${m.ca_percentage != null ? m.ca_percentage + '%' : '–'}</td>
                      <td>${m.grade_letter || '–'}</td>
                      <td>${m.grade_point != null ? m.grade_point : '–'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }).join('');
    }

    const tbody = document.getElementById("gpa-modules-tbody");
    tbody.innerHTML = modules
      .map(
        (m) =>
          `<tr>
            <td>${m.name}</td>
            <td>${m.code || "–"}</td>
            <td>${m.credits}</td>
            <td><input type="number" min="0" max="100" value="${m.ca_percentage != null ? m.ca_percentage : ""}" data-ca-input="${m.id}" style="max-width:90px;"></td>
            <td>${m.grade_letter || "–"}</td>
            <td><button type="button" class="btn btn-ghost btn-small" data-save-ca="${m.id}">Save CA</button></td>
            <td><button type="button" class="btn btn-ghost btn-small" data-delete-module="${m.id}">Delete</button></td>
          </tr>`
      )
      .join("");

    const gpaUniSelect = document.getElementById("gpa-mod-university");
    if (gpaUniSelect) {
      gpaUniSelect.innerHTML =
        '<option value="">Select university</option>' +
        (universities || []).map((u) => `<option value="${u.id}">${u.name}</option>`).join("");
    }

    const existingSelect = document.getElementById("gpa-existing-module-select");
    if (existingSelect) {
      const unique = [];
      const seen = new Set();
      (modules || []).forEach((m) => {
        const key = `${normalizeCode(m.code)}|${m.name}|${m.credits}|${m.academic_year || ""}|${m.semester_in_year || ""}|${m.university_id || ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(m);
        }
      });
      existingSelect.innerHTML =
        '<option value="">Select existing module (optional)</option>' +
        unique
          .map(
            (m, idx) =>
              `<option value="${idx}">${m.name}${m.code ? " (" + m.code + ")" : ""}${m.credits ? " - " + m.credits + " credits" : ""}</option>`
          )
          .join("");
      existingSelect.onchange = () => {
        if (!existingSelect.value) return;
        const m = unique[parseInt(existingSelect.value, 10)];
        if (!m) return;
        const nameEl = document.getElementById("gpa-mod-name");
        const codeEl = document.getElementById("gpa-mod-code");
        const creditsEl = document.getElementById("gpa-mod-credits");
        const yearEl = document.getElementById("gpa-mod-academic-year");
        const semInYearEl = document.getElementById("gpa-mod-semester-in-year");
        const semEl = document.getElementById("gpa-mod-semester");
        const uniEl = document.getElementById("gpa-mod-university");
        if (nameEl) nameEl.value = m.name || "";
        if (codeEl) codeEl.value = normalizeCode(m.code || "");
        if (creditsEl) creditsEl.value = m.credits || "";
        if (yearEl) yearEl.value = m.academic_year || 1;
        if (semInYearEl) semInYearEl.value = m.semester_in_year || 1;
        if (semEl) semEl.value = m.semester || (((m.academic_year || 1) - 1) * 2 + (m.semester_in_year || 1));
        if (uniEl && m.university_id) uniEl.value = String(m.university_id);
      };
    }

    tbody.querySelectorAll("[data-delete-module]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await del("/modules/" + btn.getAttribute("data-delete-module"));
        loadGpaPage();
      });
    });
    tbody.querySelectorAll("[data-save-ca]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const moduleId = btn.getAttribute("data-save-ca");
        const input = tbody.querySelector(`[data-ca-input="${moduleId}"]`);
        const ca = input?.value === "" ? null : parseInt(input?.value, 10);
        if (ca != null && (isNaN(ca) || ca < 0 || ca > 100)) {
          alert("CA percentage must be between 0 and 100");
          return;
        }
        const res = await put("/modules/" + moduleId, { ca_percentage: ca });
        if (res?.error) {
          alert(res.error);
          return;
        }
        loadGpaPage();
      });
    });

    // Prefill goal planner with current totals
    let totalCreditsCompleted = 0;
    let totalPoints = 0;
    modules.forEach((m) => {
      if (m.grade_point != null) {
        totalCreditsCompleted += m.credits;
        totalPoints += m.grade_point * m.credits;
      }
    });
    const creditsPerModuleInput = document.getElementById("goal-credits-per-module-input");
    if (creditsPerModuleInput && modules.length > 0) {
      const avg = modules.reduce((acc, m) => acc + (parseInt(m.credits, 10) || 0), 0) / modules.length;
      creditsPerModuleInput.value = Math.max(1, Math.round(avg));
    }
  }

  function initGpaFormAndGoalPlanner() {
    const form = document.getElementById("gpa-add-form");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = (document.getElementById("gpa-mod-name").value || "").trim();
        const code = normalizeCode(document.getElementById("gpa-mod-code").value || "");
        const universityId = document.getElementById("gpa-mod-university")?.value || "";
        const academicYear = parsePositiveInt(document.getElementById("gpa-mod-academic-year")?.value);
        const semesterInYear = parsePositiveInt(document.getElementById("gpa-mod-semester-in-year")?.value);
        const credits = parseInt(document.getElementById("gpa-mod-credits").value, 10);
        const caPercentage = document.getElementById("gpa-mod-ca").value ? parseInt(document.getElementById("gpa-mod-ca").value, 10) : null;
        const gradeLetter = document.getElementById("gpa-mod-grade").value;
        const semester = parseInt(document.getElementById("gpa-mod-semester").value, 10) || (academicYear && semesterInYear ? ((academicYear - 1) * 2 + semesterInYear) : 1);
        const grade_point = gradeLetter ? (GRADE_POINTS[gradeLetter] ?? null) : null;
//GPA VALIDATION
        if (!name || name.length > 255) {
          alert("Module name is required (1–255 characters)");
          return;
        }
        if (!code) {
          alert("Module code is required");
          return;
        }
        if (!universityId) {
          alert("Please select university");
          return;
        }
        if (!academicYear || academicYear < 1 || academicYear > 10) {
          alert("Academic year must be between 1 and 10");
          return;
        }
        if (!semesterInYear || semesterInYear < 1 || semesterInYear > 3) {
          alert("Semester must be between 1 and 3");
          return;
        }
        if (isNaN(credits) || credits < 1 || credits > 30) {
          alert("Credits must be between 1 and 30");
          return;
        }
        if (caPercentage != null && (caPercentage < 0 || caPercentage > 100)) {
          alert("CA percentage must be between 0 and 100");
          return;
        }
        if (semester < 1 || semester > 20) {
          alert("Semester must be between 1 and 20");
          return;
        }

        const res = await post("/modules", {
          user_id: currentUser.id,
          university_id: universityId,
          academic_year: academicYear,
          semester_in_year: semesterInYear,
          name,
          code,
          credits,
          grade_letter: gradeLetter || null,
          grade_point,
          ca_percentage: caPercentage,
          semester,
        });
        if (res && res.error) {
          alert(res.error);
          return;
        }
        if (res && res.updated) {
          alert("Existing module record was updated for this module code.");
        }
        form.reset();
        document.getElementById("gpa-mod-semester").value = 1;
        document.getElementById("gpa-mod-academic-year").value = 1;
        document.getElementById("gpa-mod-semester-in-year").value = 1;
        const existingSelect = document.getElementById("gpa-existing-module-select");
        if (existingSelect) existingSelect.value = "";
        loadGpaPage();
        trackUsage("module_add", "gpa", { credits, semester });
      });
    }

    const calcBtn = document.getElementById("calculate-goal-btn");
    const resultEl = document.getElementById("goal-planner-result");
    const goalInputs = [
      "target-gpa-input",
      "goal-academic-year-input",
      "goal-semester-input",
      "goal-module-count-input",
      "goal-credits-per-module-input"
    ];

    const calculateGoal = () => {
      const targetGpa = parseFloat(document.getElementById("target-gpa-input").value);
      const goalAcademicYear = parsePositiveInt(document.getElementById("goal-academic-year-input").value);
      const goalSemester = parsePositiveInt(document.getElementById("goal-semester-input").value);
      const moduleCount = parsePositiveInt(document.getElementById("goal-module-count-input").value, 0);
      const creditsPerModule = parsePositiveInt(document.getElementById("goal-credits-per-module-input").value, 3) || 3;
      let completedCredits = 0;
      let currentPoints = 0;
      const tableRows = Array.from(document.querySelectorAll("#gpa-modules-tbody tr"));
      tableRows.forEach((row) => {
        const creditsText = row.children?.[2]?.textContent || "0";
        const gradeText = row.children?.[4]?.textContent || "";
        const credits = parseInt(creditsText, 10) || 0;
        const gp = GRADE_POINTS[gradeText] != null ? GRADE_POINTS[gradeText] : null;
        if (gp != null) {
          completedCredits += credits;
          currentPoints += gp * credits;
        }
      });
      const totalCredits = completedCredits + moduleCount * creditsPerModule;

      if (!targetGpa || !goalAcademicYear || !goalSemester || !moduleCount) {
        resultEl.classList.add("hidden");
        return;
      }

      try {
        const result = calculateTargetPlan({
          targetGpa,
          totalCredits,
          completedCredits,
          currentPoints,
          totalModules: moduleCount
        });

        if (result.message) {
          resultEl.innerHTML = `<p>${result.message}</p>`;
          resultEl.classList.remove("hidden");
          return;
        }

        resultEl.innerHTML = `
          <h4>To achieve GPA ${targetGpa}:</h4>
          <p>Academic Year ${goalAcademicYear}, Semester ${goalSemester}</p>
          <div class="goal-result-grid">
            <div class="goal-item">
              <div class="label">Remaining GPA needed</div>
              <div class="value">${result.requiredRemainingGPA}</div>
            </div>
            <div class="goal-item">
              <div class="label">Target Grade</div>
              <div class="value">${result.suggestedGrade}</div>
            </div>
            <div class="goal-item">
              <div class="label">Required CA% per module</div>
              <div class="value">${result.requiredCA}</div>
            </div>
            <div class="goal-item">
              <div class="label">Required grade per module</div>
              <div class="value">${result.suggestedGrade}</div>
            </div>
            <div class="goal-item">
              <div class="label">Required CGPA</div>
              <div class="value">${result.requiredCgpa}</div>
            </div>
            <div class="goal-item">
              <div class="label">Required points per module</div>
              <div class="value">${result.perModulePoints ?? "–"}</div>
            </div>
            <div class="goal-item">
              <div class="label">Total points needed from remaining modules</div>
              <div class="value">${result.remainingPoints}</div>
            </div>
          </div>
          <p class="goal-note">This is an estimate. Actual grades depend on your final exam performance and CA weighting.</p>
        `;
        resultEl.classList.remove("hidden");
      } catch (error) {
        resultEl.innerHTML = `<p>${error.message}</p>`;
        resultEl.classList.remove("hidden");
      }
    };

    if (calcBtn && resultEl) {
      calcBtn.addEventListener("click", calculateGoal);
      
      // Auto-calculate when inputs change
      goalInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
          input.addEventListener("input", calculateGoal);
        }
      });
    }
  }

  // ==============================
  // Attendance (modules dropdown + add module)
  // ==============================

  async function loadAttendancePage() {
    if (!currentUser) return;
    const [modules, attendanceLogs, universities] = await Promise.all([
      get("/users/" + currentUser.id + "/modules"),
      get("/users/" + currentUser.id + "/attendance-logs"),
      get("/universities"),
    ]);

    attendanceUniversities = universities || [];
    const attendance = attendanceLogs || [];

    const uniSelect = document.getElementById("attendance-university-select");
    const addModuleUniSelect = document.getElementById("attendance-module-university");
    if (uniSelect) {
      uniSelect.innerHTML =
        '<option value="">Select university</option>' +
        attendanceUniversities
          .map((u) => `<option value="${u.id}">${u.name}</option>`)
          .join("");
      selectedAttendanceUniversityId = attendanceUniversities.length ? attendanceUniversities[0].id : null;
      if (selectedAttendanceUniversityId) uniSelect.value = String(selectedAttendanceUniversityId);
    }
    if (addModuleUniSelect) {
      addModuleUniSelect.innerHTML =
        '<option value="">Select university</option>' +
        attendanceUniversities.map((u) => `<option value="${u.id}">${u.name}</option>`).join("");
      if (selectedAttendanceUniversityId) addModuleUniSelect.value = String(selectedAttendanceUniversityId);
    }

    const hallsSummaryEl = document.getElementById("attendance-halls-summary");
    const hallSelect = document.getElementById("attendance-hall-select");

    function filterModulesByYearSem() {
      const ay = parsePositiveInt(document.getElementById("attendance-slot-year")?.value);
      const sem = parsePositiveInt(document.getElementById("attendance-slot-semester")?.value);
      return (modules || []).filter((m) => {
        const my = parsePositiveInt(m.academic_year);
        const ms = parsePositiveInt(m.semester_in_year);
        if (!ay || !sem) return true;
        return my === ay && ms === sem;
      });
    }

    function renderAttendanceModuleDropdowns() {
      const filtered = filterModulesByYearSem();
      const select = document.getElementById("attendance-module-select");
      if (select) {
        select.innerHTML =
          '<option value="">Select module</option>' +
          filtered.map((m) => `<option value="${m.name}">${m.name}${m.code ? " (" + m.code + ")" : ""}</option>`).join("");
      }
      const slotModuleSelect = document.getElementById("attendance-slot-module-select");
      if (slotModuleSelect) {
        slotModuleSelect.innerHTML =
          '<option value="">Select module</option>' +
          filtered.map((m) => `<option value="${m.name}">${m.name}${m.code ? " (" + m.code + ")" : ""}</option>`).join("");
      }
    }
    renderAttendanceModuleDropdowns();
    const slotSemSel = document.getElementById("attendance-slot-semester");
    const slotYearSel = document.getElementById("attendance-slot-year");
    if (slotSemSel && !slotSemSel.dataset.moduleFilterBound) {
      slotSemSel.dataset.moduleFilterBound = "1";
      slotSemSel.addEventListener("change", renderAttendanceModuleDropdowns);
    }
    if (slotYearSel && !slotYearSel.dataset.moduleFilterBound) {
      slotYearSel.dataset.moduleFilterBound = "1";
      slotYearSel.addEventListener("change", renderAttendanceModuleDropdowns);
    }

    const tbody = document.getElementById("attendance-table");
    tbody.innerHTML = attendance.length
      ? attendance
          .map((a) => {
            const pct = Math.round((a.attended / (a.total_sessions || 1)) * 100);
            const modeLabel = a.delivery_mode === "online" ? " (Online)" : " (Physical)";
            return `<tr><td>${a.module_name}${modeLabel}</td><td>${a.attended}</td><td>${a.total_sessions}</td><td>${pct}%</td></tr>`;
          })
          .join("")
      : "<tr><td colspan=\"4\">No attendance records yet</td></tr>";

    const ctx = document.getElementById("page-attendanceChart");
    if (ctx) {
      if (pageAttendanceChart) pageAttendanceChart.destroy();
      pageAttendanceChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: attendance.map((a) => `${a.module_name}${a.delivery_mode === "online" ? " (Online)" : " (Physical)"}`),
          datasets: [
            {
              label: "Attendance %",
              data: attendance.map((a) => Math.round((a.attended / (a.total_sessions || 1)) * 100)),
              backgroundColor: attendance.map((a) =>
                a.delivery_mode === "online" ? "rgba(59,130,246,0.6)" : "rgba(0,201,167,0.6)"
              ),
            },
          ],
        },
        options: { responsive: true, maintainAspectRatio: true },
      });
    }
//GEOFENCE COORDIBNTION
    // Load halls for selected university (circle geofences)
    async function loadSelectedHalls() {
      if (!selectedAttendanceUniversityId) {
        attendanceHalls = [];
        if (hallsSummaryEl) hallsSummaryEl.textContent = "No halls configured";
        return;
      }
      attendanceHalls = await get("/universities/" + selectedAttendanceUniversityId + "/halls");
      if (hallsSummaryEl) {
        hallsSummaryEl.textContent = attendanceHalls.length
          ? `${attendanceHalls.length} lecture hall circle(s) configured`
          : "No halls configured for this university";
      }
      if (hallSelect) {
        hallSelect.innerHTML =
          '<option value="">Select hall</option>' +
          attendanceHalls
            .map((h) => `<option value="${h.id}">${h.hall_name}${h.building_name ? " (" + h.building_name + ")" : ""}</option>`)
            .join("");
      }

      const slotHallSelect = document.getElementById("attendance-slot-hall-select");
      if (slotHallSelect) {
        slotHallSelect.innerHTML =
          '<option value="">Select hall</option>' +
          attendanceHalls
            .map((h) => `<option value="${h.id}">${h.hall_name}${h.building_name ? " (" + h.building_name + ")" : ""}</option>`)
            .join("");
      }
    }

    if (uniSelect) {
      uniSelect.onchange = async () => {
        selectedAttendanceUniversityId = uniSelect.value ? parseInt(uniSelect.value, 10) : null;
        // Reset UI when changing geofence source
        document.getElementById("attendance-mark-section")?.classList.add("hidden");
        document.getElementById("geofence-outside-msg")?.classList.add("hidden");
        document.getElementById("geofence-status-card")?.classList.remove("within", "outside");
        document.getElementById("geofence-status-text").textContent = "Check your location to mark attendance";
        document.getElementById("geofence-status-detail").textContent = 'Tap "Check location" to verify you are inside a lecture hall circle';

        await loadSelectedHalls();
      };
    }

    await loadSelectedHalls();

    // Prefill slot semester/year from timetable upload inputs (if present)
    const timetableSemester = document.getElementById("attendance-timetable-semester")?.value;
    const timetableYear = document.getElementById("attendance-timetable-year")?.value;
    const slotSem = document.getElementById("attendance-slot-semester");
    const slotYear = document.getElementById("attendance-slot-year");
    if (slotSem && timetableSemester) slotSem.value = timetableSemester;
    if (slotYear && timetableYear) slotYear.value = timetableYear;
    renderAttendanceModuleDropdowns();
  }

  async function loadAttendance() {
    await loadAttendancePage();
  }

  function initAttendance() {
    const timetableForm = document.getElementById("attendance-timetable-upload-form");
    if (timetableForm && !timetableForm.dataset.bound) {
      timetableForm.dataset.bound = "1";
      timetableForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (currentUser?.role !== "student") {
          return alert("Only students can upload timetables.");
        }
        const universityId = document.getElementById("attendance-university-select")?.value;
        const semester = document.getElementById("attendance-timetable-semester")?.value || "";
        const yearNumber = document.getElementById("attendance-timetable-year")?.value || "";
        const fileInput = document.getElementById("attendance-timetable-file");
        const file = fileInput?.files?.[0];

        if (!universityId) return alert("Select a university first.");
        if (!semester.trim()) return alert("Enter semester.");
        if (!yearNumber || isNaN(parseInt(yearNumber, 10))) return alert("Enter a valid academic year.");
        if (!file) return alert("Select a PDF file.");

        const fd = new FormData();
        fd.append("user_id", currentUser.id);
        fd.append("university_id", universityId);
        fd.append("semester", semester.trim());
        fd.append("year_number", parseInt(yearNumber, 10));
        fd.append("file", file);

        const msgEl = document.getElementById("attendance-timetable-upload-msg");
        if (msgEl) {
          msgEl.classList.remove("hidden");
          msgEl.textContent = "Uploading...";
        }

        const resp = await fetch(API + "/attendance/timetable-pdfs", { method: "POST", body: fd, credentials: "include" });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok || json.error) {
          if (msgEl) msgEl.textContent = json.error || "Upload failed";
          return;
        }
        if (msgEl) msgEl.textContent = "Timetable uploaded successfully.";
        trackUsage("timetable_upload", "attendance", { university_id: universityId, semester, year_number: parseInt(yearNumber, 10) });
      });
    }

    // ==============================
    // Day-wise schedule slots
    // ==============================

    const slotAddForm = document.getElementById("attendance-slot-add-form");
    const slotsTbody = document.getElementById("attendance-slots-tbody");
    const slotSelect = document.getElementById("attendance-slot-select");
    const slotDaySelect = document.getElementById("attendance-slot-day");
    const slotModeSelect = document.getElementById("attendance-slot-mode");
    const slotHallGroup = document.getElementById("attendance-slot-hall-group");
    const slotHallSelect = document.getElementById("attendance-slot-hall-select");

    let attendanceSlotsForDay = [];

    function dayOfWeekFromDate(dateStr) {
      if (!dateStr) return "";
      const d = new Date(dateStr + "T00:00:00");
      if (isNaN(d.getTime())) return "";
      const idx = d.getDay(); // 0 Sun ... 6 Sat
      const map = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      return map[idx] || "";
    }

    function syncSlotHallUI() {
      const mode = slotModeSelect?.value || "physical";
      if (slotHallGroup) slotHallGroup.classList.toggle("hidden", mode !== "physical");
    }

    if (slotModeSelect && !slotModeSelect.dataset.bound) {
      slotModeSelect.dataset.bound = "1";
      slotModeSelect.addEventListener("change", syncSlotHallUI);
      syncSlotHallUI();
    }

    async function refreshSlotsList() {
      if (!slotsTbody) return;
      const universityId = document.getElementById("attendance-university-select")?.value;
      const semester = document.getElementById("attendance-slot-semester")?.value || "";
      const yearNumber = document.getElementById("attendance-slot-year")?.value || "";
      if (!universityId || !semester || !yearNumber) {
        slotsTbody.innerHTML = "<tr><td colspan=\"5\">Select university, semester & year to view slots</td></tr>";
        return;
      }
      const rows = await get(
        `/attendance/slots?user_id=${currentUser.id}&university_id=${universityId}&semester=${semester}&year_number=${yearNumber}`
      ).catch(() => []);
      slotsTbody.innerHTML = rows.length
        ? rows
            .map(
              (s) => `
                <tr>
                  <td>${s.day_of_week}</td>
                  <td>${s.start_time} - ${s.end_time}</td>
                  <td>${s.module_name}</td>
                  <td>${s.delivery_mode}</td>
                  <td>${s.verification_status || "—"}</td>
                </tr>
              `
            )
            .join("")
        : "<tr><td colspan=\"5\">No slots yet</td></tr>";
    }

    async function refreshAttendanceSlotSelect() {
      if (!slotSelect) return;
      attendanceSlotsForDay = [];

      const universityId = document.getElementById("attendance-university-select")?.value;
      const lectureDate = document.getElementById("attendance-lecture-date")?.value;
      const semester = document.getElementById("attendance-semester")?.value;
      if (!universityId || !lectureDate || !semester) {
        slotSelect.innerHTML = '<option value="">Select slot</option>';
        return;
      }
      const yearNumber = parsePositiveInt(document.getElementById("attendance-academic-year")?.value);
      const day = dayOfWeekFromDate(lectureDate);
      if (!day || !yearNumber) {
        slotSelect.innerHTML = '<option value="">Select slot</option>';
        return;
      }

      const rows = await get(
        `/attendance/slots?user_id=${currentUser.id}&university_id=${universityId}&semester=${semester}&year_number=${yearNumber}&day_of_week=${encodeURIComponent(
          day
        )}`
      ).catch(() => []);
      attendanceSlotsForDay = rows;
      slotSelect.innerHTML = rows.length
        ? rows
            .map((s) => {
              const title = `${s.module_name} | ${s.start_time}-${s.end_time} | ${s.delivery_mode}`;
              const disabled = s.verification_status !== "auto_verified";
              return `<option value="${s.id}" ${disabled ? "disabled" : ""}>${title}</option>`;
            })
            .join("")
        : '<option value="">No slots available for this day</option>';
    }

    if (slotAddForm && !slotAddForm.dataset.bound) {
      slotAddForm.dataset.bound = "1";
      slotAddForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const universityId = document.getElementById("attendance-university-select")?.value;
        if (!universityId) return alert("Select university first.");
        const day = slotDaySelect?.value || "";
        const start_time = document.getElementById("attendance-slot-start")?.value || "";
        const end_time = document.getElementById("attendance-slot-end")?.value || "";
        const mode = slotModeSelect?.value || "physical";
        const module_name = document.getElementById("attendance-slot-module-select")?.value || "";
        const location_text = document.getElementById("attendance-slot-location")?.value || "";
        const semester = document.getElementById("attendance-slot-semester")?.value || "";
        const year_number = document.getElementById("attendance-slot-year")?.value || "";
        const hall_id = mode === "physical" ? slotHallSelect?.value || "" : "";

        if (!day || !start_time || !end_time || !module_name || !semester || !year_number) {
          return alert("Fill all slot fields correctly.");
        }
        const res = await post("/attendance/slots", {
          user_id: currentUser.id,
          university_id: universityId,
          semester,
          year_number,
          day_of_week: day,
          start_time,
          end_time,
          module_name,
          delivery_mode: mode,
          location_text: location_text || null,
          hall_id: hall_id || null,
        });
        if (res && res.error) return alert(res.error);
        await refreshSlotsList();
        await refreshAttendanceSlotSelect();
      });
    }

    if (slotSelect && !slotSelect.dataset.bound) {
      slotSelect.dataset.bound = "1";
      slotSelect.addEventListener("change", () => {
        const id = slotSelect.value;
        const slot = attendanceSlotsForDay.find((s) => String(s.id) === String(id));
        if (!slot) return;

        const modeSelect = document.getElementById("attendance-delivery-mode");
        if (modeSelect) {
          modeSelect.value = slot.delivery_mode === "online" ? "online" : "offline";
          modeSelect.dispatchEvent(new Event("change"));
        }
        const hallSelect = document.getElementById("attendance-hall-select");
        if (hallSelect) {
          hallSelect.value = slot.hall_id ? String(slot.hall_id) : "";
        }
        const moduleSelect = document.getElementById("attendance-module-select");
        if (moduleSelect) {
          moduleSelect.value = slot.module_name || "";
        }
      });
    }

    const lectureDateEl = document.getElementById("attendance-lecture-date");
    const semesterEl = document.getElementById("attendance-semester");
    if (lectureDateEl && !lectureDateEl.dataset.bound) {
      lectureDateEl.dataset.bound = "1";
      lectureDateEl.addEventListener("change", () => refreshAttendanceSlotSelect());
    }
    if (semesterEl && !semesterEl.dataset.bound) {
      semesterEl.dataset.bound = "1";
      semesterEl.addEventListener("change", () => refreshAttendanceSlotSelect());
    }
    const academicYearEl = document.getElementById("attendance-academic-year");
    if (academicYearEl && !academicYearEl.dataset.bound) {
      academicYearEl.dataset.bound = "1";
      academicYearEl.addEventListener("change", () => refreshAttendanceSlotSelect());
    }
    const uniSel = document.getElementById("attendance-university-select");
    if (uniSel && !uniSel.dataset.boundSlots) {
      uniSel.dataset.boundSlots = "1";
      uniSel.addEventListener("change", () => {
        refreshSlotsList();
        refreshAttendanceSlotSelect();
      });
    }

    // Initial load (if user already selected inputs)
    refreshSlotsList();
    refreshAttendanceSlotSelect();

    const addModuleForm = document.getElementById("attendance-add-module-form");
    if (addModuleForm && !addModuleForm.dataset.bound) {
      addModuleForm.dataset.bound = "1";
      addModuleForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const universityId = document.getElementById("attendance-module-university")?.value || "";
        const academicYear = parsePositiveInt(document.getElementById("attendance-module-academic-year")?.value);
        const semesterInYear = parsePositiveInt(document.getElementById("attendance-module-semester-in-year")?.value);
        const name = (document.getElementById("attendance-module-name").value || "").trim();
        const code = normalizeCode(document.getElementById("attendance-module-code").value || "");
        if (!universityId) return alert("Select university.");
        if (!academicYear || !semesterInYear) return alert("Enter academic year and semester.");
        if (!name || name.length > 255) {
          alert("Module name is required (1–255 characters)");
          return;
        }
        if (!code) return alert("Module code is required.");
        const res = await post("/modules", {
          user_id: currentUser.id,
          university_id: universityId,
          academic_year: academicYear,
          semester_in_year: semesterInYear,
          name,
          code,
          credits: 3,
          semester: (academicYear - 1) * 2 + semesterInYear,
        });
        if (res && res.error) {
          alert(res.error);
          return;
        }
        addModuleForm.reset();
        loadAttendancePage();
      });
    }

    const attForm = document.getElementById("attendance-form");
    if (attForm) {
      const modeSelect = document.getElementById("attendance-delivery-mode");
      const proofGroup = document.getElementById("attendance-online-proof-group");
      const hallGroup = document.getElementById("attendance-hall-group");
      const toggleModeUi = () => {
        const mode = modeSelect?.value || "offline";
        if (proofGroup) proofGroup.classList.toggle("hidden", mode !== "online");
        if (hallGroup) hallGroup.classList.toggle("hidden", mode === "online");
      };
      if (modeSelect && !modeSelect.dataset.bound) {
        modeSelect.dataset.bound = "1";
        modeSelect.addEventListener("change", toggleModeUi);
        toggleModeUi();
      }

      attForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const slot_id = document.getElementById("attendance-slot-select")?.value || "";
        const module_name = document.getElementById("attendance-module-select").value?.trim() || "";
        const total_sessions = parseInt(document.getElementById("attendance-total").value, 10) || 0;
        const attended = parseInt(document.getElementById("attendance-attended").value, 10) || 0;
        const semester = parseInt(document.getElementById("attendance-semester").value, 10) || null;
        const academic_year = parseInt(document.getElementById("attendance-academic-year").value, 10) || null;
        const delivery_mode = document.getElementById("attendance-delivery-mode")?.value || "offline";
        const hall_id = document.getElementById("attendance-hall-select")?.value || "";
        const lecture_date = document.getElementById("attendance-lecture-date")?.value || "";
        const proofFile = document.getElementById("attendance-online-proof")?.files?.[0] || null;
        if (!lecture_date) {
          alert("Select lecture date.");
          return;
        }
        if (!slot_id) {
          alert("Select a verified schedule slot.");
          return;
        }
        if (!module_name) {
          alert("Select a module");
          return;
        }
        if (total_sessions < 0 || attended < 0) {
          alert("Attended and total sessions must be 0 or greater");
          return;
        }
        if (attended > total_sessions) {
          alert("Attended cannot exceed total sessions");
          return;
        }
        if (delivery_mode === "offline" && !hall_id) {
          alert("Select lecture hall for offline attendance.");
          return;
        }
        if (delivery_mode === "online" && !proofFile) {
          alert("Upload proof for online lecture change.");
          return;
        }

        const fd = new FormData();
        fd.append("user_id", currentUser.id);
        fd.append("slot_id", slot_id);
        fd.append("module_name", module_name);
        fd.append("attended", attended);
        fd.append("total_sessions", total_sessions);
        if (semester != null) fd.append("semester", semester);
        if (academic_year != null) fd.append("academic_year", academic_year);
        fd.append("delivery_mode", delivery_mode);
        if (selectedAttendanceUniversityId) fd.append("university_id", selectedAttendanceUniversityId);
        if (hall_id) fd.append("hall_id", hall_id);
        if (lecture_date) fd.append("lecture_date", lecture_date);
        if (proofFile) fd.append("proof", proofFile);

        const resp = await fetch(API + "/attendance/mark", { method: "POST", body: fd, credentials: "include" });
        const res = await resp.json().catch(() => ({}));
        if (!resp.ok || (res && res.error)) {
          alert(res.error || "Attendance mark failed");
          return;
        }

        if (res.verification_status === "timetable_missing") {
          alert("Attendance submitted, but timetable verification failed. Upload your timetable PDF for this semester and wait for admin approval.");
        } else if (res.verification_status === "pending") {
          alert("Attendance submitted for admin verification (online lecture proof).");
        } else if (res.verification_status === "auto_verified") {
          alert("Attendance marked successfully and verified.");
        }
        attForm.reset();
        toggleModeUi();
        loadAttendancePage();
        loadDashboard();
        trackUsage("attendance_mark", "attendance", { module_name, delivery_mode });
      });
    }
  }

  // ==============================
  // Task Planner (chart: target vs current)
  // ==============================

  async function loadTasks() {
    if (!currentUser) return;
    const [tasks, modules] = await Promise.all([
      get("/users/" + currentUser.id + "/tasks"),
      get("/users/" + currentUser.id + "/modules"),
    ]);
    const moduleByCode = new Map((modules || []).map((m) => [normalizeCode(m.code), m]));
    tasks.sort((a, b) => {
      const pa = parseInt(a.priority_score, 10) || 0;
      const pb = parseInt(b.priority_score, 10) || 0;
      if (pa !== pb) return pb - pa; // highest priority first
      const da = a.due_date ? String(a.due_date) : "9999-12-31";
      const db = b.due_date ? String(b.due_date) : "9999-12-31";
      return da < db ? -1 : da > db ? 1 : 0;
    });

    const listEl = document.getElementById("tasks-list");
    if (!tasks.length) {
      listEl.innerHTML = '<p class="empty-state">No tasks yet. Add one above.</p>';
    } else {
      const grouped = {};
      tasks.forEach((t) => {
        const mod = moduleByCode.get(normalizeCode(t.module_code));
        const credits = mod?.credits || 0;
        const key = credits > 0 ? `${credits} Credits` : "Unassigned / Unknown Credits";
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(t);
      });
      const sortedGroups = Object.keys(grouped).sort((a, b) => {
        const na = parseInt(a, 10) || 0;
        const nb = parseInt(b, 10) || 0;
        return nb - na;
      });
      listEl.innerHTML = sortedGroups
        .map((groupName) => {
          const rows = grouped[groupName];
          return `
            <div class="card" style="margin-bottom:0.75rem;">
              <h3 style="margin-bottom:0.5rem;">${groupName}</h3>
              ${rows
                .map(
                  (t) => `
                  <div style="margin-bottom:0.5rem; display:flex; align-items:center; justify-content:space-between;">
                    <div>
                      <span style="text-decoration:${t.completed ? "line-through" : "none"}">${t.title}</span>
                      <span class="text-muted">${t.module_code ? " | " + t.module_code : ""}</span>
                      ${t.due_date ? `<span class="text-muted">Due: ${t.due_date}</span>` : ""}
                      <span class="badge badge-${t.priority_score >= 8 ? "high" : t.priority_score >= 5 ? "medium" : "low"}">P${t.priority_score}</span>
                    </div>
                    <div class="actions">
                      <button type="button" class="btn btn-ghost btn-small" data-task-toggle="${t.id}" data-completed="${t.completed}">${t.completed ? "Undo" : "Complete"}</button>
                      <button type="button" class="btn btn-ghost btn-small" data-task-delete="${t.id}">Delete</button>
                    </div>
                  </div>`
                )
                .join("")}
            </div>
          `;
        })
        .join("");
    }

    listEl.querySelectorAll("[data-task-toggle]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-task-toggle");
        const completed = btn.getAttribute("data-completed") === "1";
        const newCompleted = !completed;
        await patch("/tasks/" + id, { completed: newCompleted });
        loadTasks();
        trackUsage(newCompleted ? "task_complete" : "task_uncomplete", "tasks", { task_id: id });
      });
    });
    listEl.querySelectorAll("[data-task-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-task-delete");
        await del("/tasks/" + id);
        loadTasks();
        trackUsage("task_delete", "tasks", { task_id: id });
      });
    });

    const completedCount = tasks.filter((t) => t.completed).length;
    const totalCount = tasks.length;
    const ctx = document.getElementById("tasksChart");
    if (ctx) {
      if (tasksChart) tasksChart.destroy();
      tasksChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: ["Completed", "Remaining"],
          datasets: [
            {
              label: "Tasks",
              data: [completedCount, Math.max(0, totalCount - completedCount)],
              backgroundColor: ["#10b981", "#2d3a4f"],
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { title: { display: true, text: "Target: complete all tasks | Current: " + completedCount + " / " + totalCount } },
        },
      });
    }
  }

  function initTasksForm() {
    const form = document.getElementById("task-add-form");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const title = (document.getElementById("task-title").value || "").trim();
        const module_code = normalizeCode(document.getElementById("task-module-code").value || "");
        const due_date = document.getElementById("task-due-date").value || null;
        const priority_score = parseInt(document.getElementById("task-priority").value, 10) || 5;
        if (!module_code) {
          alert("Module code is required");
          return;
        }
        if (!title || title.length > 500) {
          alert("Task title is required (1–500 characters)");
          return;
        }
        if (priority_score < 1 || priority_score > 10) {
          alert("Priority must be between 1 and 10");
          return;
        }
        const res = await post("/tasks", { user_id: currentUser.id, module_code, title, due_date, priority_score });
        if (res && res.error) {
          alert(res.error);
          return;
        }
        form.reset();
        document.getElementById("task-priority").value = 5;
        loadTasks();
        trackUsage("task_add", "tasks", { due_date });
      });
    }
  }

  // ==============================
  // Repeat & Improvement (charts, record improvement, remove entries)
  // ==============================

  async function loadRepeat() {
    if (!currentUser) return;
    const [modules, universities] = await Promise.all([
      get("/users/" + currentUser.id + "/modules"),
      get("/universities").catch(() => []),
    ]);

    const repeatCandidates = modules.filter(
      (m) => Boolean(m.is_repeat) || isGradeBelowC(m.grade_letter) || m.source_type === "repeat_add"
    );
    const repeatCount = repeatCandidates.length;
    const normalCount = modules.length - repeatCount;

    const barCtx = document.getElementById("page-repeatChart");
    if (barCtx) {
      if (pageRepeatBarChart) pageRepeatBarChart.destroy();
      pageRepeatBarChart = new Chart(barCtx, {
        type: "bar",
        data: {
          labels: ["Target (0 repeats)", "Current repeats"],
          datasets: [{ label: "Count", data: [0, repeatCount], backgroundColor: ["#00c9a7", "#f59e0b"] }],
        },
        options: { responsive: true, maintainAspectRatio: true, plugins: { title: { display: true, text: "Target vs current repeat modules" } } },
      });
    }

    const pieCtx = document.getElementById("repeat-pie-chart");
    if (pieCtx) {
      if (repeatPieChart) repeatPieChart.destroy();
      repeatPieChart = new Chart(pieCtx, {
        type: "pie",
        data: {
          labels: ["Normal", "Repeat"],
          datasets: [{ data: [normalCount, repeatCount], backgroundColor: ["#00c9a7", "#f59e0b"] }],
        },
        options: { responsive: true, maintainAspectRatio: true },
      });
    }

    // Record improvement: populate module dropdown
    const improveSelect = document.getElementById("repeat-improve-module");
    if (improveSelect) {
      improveSelect.innerHTML = '<option value="">Select module</option>' +
        repeatCandidates.map((m) => `<option value="${m.id}">${m.name}${m.code ? " (" + m.code + ")" : ""} — ${m.grade_letter || "–"}</option>`).join("");
    }
    const repeatAddUni = document.getElementById("repeat-add-university");
    if (repeatAddUni) {
      repeatAddUni.innerHTML =
        '<option value="">Select university</option>' +
        universities.map((u) => `<option value="${u.id}">${u.name}</option>`).join("");
    }
//ERROR HANDLING
    const academicHistoryModules = repeatCandidates;
    const tbody = document.getElementById("repeat-modules-tbody");
    tbody.innerHTML = academicHistoryModules.length
      ? academicHistoryModules
          .map(
            (m) =>
              `<tr>
                <td>${m.name}</td><td>${m.code || "–"}</td><td>${m.credits}</td><td>${m.grade_letter || "–"}</td><td>${m.academic_year || "–"} / ${m.semester_in_year || "–"}</td>
                <td>${m.is_repeat ? "Yes" : "No"}</td>
                <td class="actions">
                  <button type="button" class="btn btn-ghost btn-small" data-repeat-improve="${m.id}">Improve</button>
                  <button type="button" class="btn btn-ghost btn-small btn-danger-outline" data-repeat-remove="${m.id}">Remove</button>
                </td>
              </tr>`
          )
          .join("")
      : "<tr><td colspan=\"7\">No modules. Add modules in GPA Calculator first.</td></tr>";

    // Improve button: select this module in the form
    tbody.querySelectorAll("[data-repeat-improve]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-repeat-improve");
        if (improveSelect) improveSelect.value = id;
        document.getElementById("repeat-improve-grade")?.focus();
      });
    });

    // Remove button: confirm and delete
    tbody.querySelectorAll("[data-repeat-remove]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-repeat-remove");
        if (!confirm("Remove this entry from your academic history? This cannot be undone.")) return;
        await del("/modules/" + id);
        loadRepeat();
        loadDashboard();
        trackUsage("module_remove", "repeat", { module_id: id });
      });
    });
  }

  function initRepeatImprovementForm() {
    const form = document.getElementById("repeat-record-improvement-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const moduleId = document.getElementById("repeat-improve-module")?.value;
      const gradeLetter = document.getElementById("repeat-improve-grade")?.value;
      const noLongerRepeat = document.getElementById("repeat-improve-no-longer-repeat")?.checked !== false;
      if (!moduleId || !gradeLetter) {
        alert("Select a module and new grade.");
        return;
      }
      if (!GRADE_POINTS[gradeLetter] && gradeLetter !== "F") {
        alert("Please select a valid grade.");
        return;
      }
      const gradePoint = GRADE_POINTS[gradeLetter] ?? null;
      const res = await put("/modules/" + moduleId, {
        grade_letter: gradeLetter,
        grade_point: gradePoint,
        is_repeat: noLongerRepeat ? 0 : 1,
      });
      if (res && res.error) {
        alert(res.error);
        return;
      }
      form.reset();
      document.getElementById("repeat-improve-no-longer-repeat").checked = true;
      loadRepeat();
      loadDashboard();
      trackUsage("repeat_improve", "repeat", { module_id: moduleId, grade_letter: gradeLetter, no_longer_repeat: noLongerRepeat });
    });
  }

  function initRepeatAddModuleForm() {
    const form = document.getElementById("repeat-add-module-form");
    if (!form || form.dataset.bound) return;
    form.dataset.bound = "1";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const university_id = document.getElementById("repeat-add-university")?.value || "";
      const academic_year = parsePositiveInt(document.getElementById("repeat-add-academic-year")?.value);
      const semester_in_year = parsePositiveInt(document.getElementById("repeat-add-semester-in-year")?.value);
      const name = (document.getElementById("repeat-add-module-name")?.value || "").trim();
      const code = normalizeCode(document.getElementById("repeat-add-module-code")?.value || "");
      const credits = parseInt(document.getElementById("repeat-add-credits")?.value, 10);
      if (!university_id || !academic_year || !semester_in_year || !name || !code || isNaN(credits)) {
        return alert("Fill all module fields.");
      }
      const semester = (academic_year - 1) * 2 + semester_in_year;
      const res = await post("/modules", {
        user_id: currentUser.id,
        university_id,
        academic_year,
        semester_in_year,
        source_type: "repeat_add",
        name,
        code,
        credits,
        semester,
        is_repeat: 1,
      });
      if (res?.error) return alert(res.error);
      if (res?.updated) alert("Existing module record was updated for this module code.");
      form.reset();
      document.getElementById("repeat-add-academic-year").value = 1;
      document.getElementById("repeat-add-semester-in-year").value = 1;
      document.getElementById("repeat-add-credits").value = 3;
      await loadRepeat();
      await loadDashboard();
    });
  }

  initRepeatImprovementForm();
  initRepeatAddModuleForm();

  // ==============================
  // Concerns (student + admin)
  // ==============================

  let universitiesCache = null;

  async function loadUniversitiesCache() {
    if (universitiesCache) return universitiesCache;
    universitiesCache = await get("/universities").catch(() => []);
    return universitiesCache;
  }

  function getUniversityNameById(universityId) {
    const uid = parseInt(universityId, 10);
    const uni = universitiesCache?.find((u) => u.id === uid);
    return uni?.name || "Unknown";
  }

  async function loadConcernsPage() {
    if (!currentUser) return;

    await loadUniversitiesCache();

    // Populate select
    const uniSelect = document.getElementById("concerns-university-select");
    if (uniSelect) {
      uniSelect.innerHTML =
        '<option value="">Select university</option>' +
        universitiesCache.map((u) => `<option value="${u.id}">${u.name}</option>`).join("");
    }

    // Render list
    const tbody = document.getElementById("concerns-list-tbody");
    if (tbody) {
      const concerns = await get("/users/" + currentUser.id + "/concerns").catch(() => []);
      tbody.innerHTML = concerns.length
        ? concerns
            .map(
              (c) => `
              <tr>
                <td>${getUniversityNameById(c.university_id)}</td>
                <td>${c.category || "—"}</td>
                <td>${c.status || "—"}</td>
                <td>${(c.message || "").slice(0, 180)}${(c.message || "").length > 180 ? "..." : ""}</td>
                <td>${c.created_at ? String(c.created_at).slice(0, 10) : "—"}</td>
              </tr>
            `
            )
            .join("")
        : "<tr><td colspan=\"5\">No concerns yet</td></tr>";
    }

    // Submit
    const form = document.getElementById("concern-submit-form");
    if (form && !form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const universityId = document.getElementById("concerns-university-select")?.value;
        const category = document.getElementById("concerns-category")?.value || "General";
        const message = document.getElementById("concerns-message")?.value || "";

        if (!universityId) return alert("Select a university");
        if (!message || message.trim().length < 3) return alert("Message is too short");
        if (message.length > 2000) return alert("Message must be <= 2000 characters");

        const res = await post("/concerns", {
          user_id: currentUser.id,
          university_id: universityId,
          category,
          message: message.trim(),
        });
        if (res && res.error) return alert(res.error);
        trackUsage("concern_submit", "concerns", { university_id: universityId, category });
        form.reset();
        await loadConcernsPage();
      });
    }
  }

  // ==============================
  // Admin pages
  // ==============================

  function requireAdminOnlyUI() {
    if (!currentUser || currentUser.role !== "admin") {
      alert("Admin access only");
      return false;
    }
    return true;
  }

  async function loadAdminDashboard() {
    if (!requireAdminOnlyUI()) return;
    const [users, unis, hallsTotal, openConcerns] = await Promise.all([
      get("/admin/users?admin_user_id=" + currentUser.id).catch(() => []),
      get("/universities").catch(() => []),
      (async () => {
        const unisRows = await get("/universities").catch(() => []);
        let total = 0;
        for (const u of unisRows) {
          const hs = await get("/universities/" + u.id + "/halls").catch(() => []);
          total += hs.length;
        }
        return total;
      })(),
      get("/admin/concerns?admin_user_id=" + currentUser.id + "&status=open").catch(() => []),
    ]);
    document.getElementById("admin-total-users").textContent = users.length;
    document.getElementById("admin-total-universities").textContent = unis.length;
    document.getElementById("admin-open-concerns").textContent = openConcerns.length;
    document.getElementById("admin-total-halls").textContent = hallsTotal;
  }

  async function loadAdminUsers() {
    if (!requireAdminOnlyUI()) return;
    const tbody = document.getElementById("admin-users-tbody");
    if (!tbody) return;
    const users = await get("/admin/users?admin_user_id=" + currentUser.id).catch(() => []);
    tbody.innerHTML = users.length
      ? users
          .map(
            (u) => `
          <tr>
            <td>${u.name || "—"}</td>
            <td>${u.email || "—"}</td>
            <td>${u.index_number || "—"}</td>
            <td>${u.role || "student"}</td>
            <td>${u.created_at ? String(u.created_at).slice(0, 10) : "—"}</td>
            <td>
              <select data-role-sel="${u.id}" class="admin-role-select">
                <option value="student" ${u.role === "student" ? "selected" : ""}>student</option>
                <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option>
              </select>
              <button type="button" class="btn btn-ghost btn-small" data-role-save="${u.id}">Save</button>
            </td>
          </tr>
        `
          )
          .join("")
      : "<tr><td colspan=\"6\">No users</td></tr>";

    tbody.querySelectorAll("[data-role-save]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-role-save");
        const sel = tbody.querySelector('select[data-role-sel="' + id + '"]');
        const role = sel?.value || "student";
        const res = await put("/admin/users/" + id + "/role", { admin_user_id: currentUser.id, role });
        if (res && res.error) alert(res.error);
        // If the currently logged-in admin promoted/changed their own role,
        // reload so the UI immediately switches to admin-only options.
        if (String(id) === String(currentUser.id)) {
          currentUser.role = role;
          const nowIsAdmin = currentUser.role === "admin";
          document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", !nowIsAdmin));
          document.querySelectorAll(".student-only").forEach((el) => el.classList.toggle("hidden", nowIsAdmin));
          showPage(nowIsAdmin ? "admin-dashboard" : "dashboard");
          return;
        }
        await loadAdminUsers();
      });
    });
  }

  async function loadAdminUniversitiesForHalls() {
    if (!requireAdminOnlyUI()) return;
    const universities = await loadUniversitiesCache();
    const select = document.getElementById("admin-university-select-halls");
    if (select) {
      select.innerHTML =
        '<option value="">Select university</option>' +
        universities.map((u) => `<option value="${u.id}">${u.name}</option>`).join("");
      if (!select.dataset.bound) {
        select.dataset.bound = "1";
        select.addEventListener("change", () => loadAdminHallsPage());
      }
    }
    const ttSelect = document.getElementById("admin-university-select-timetable");
    if (ttSelect) {
      ttSelect.innerHTML =
        '<option value="">Select university</option>' +
        universities.map((u) => `<option value="${u.id}">${u.name}</option>`).join("");
      if (!ttSelect.dataset.bound) {
        ttSelect.dataset.bound = "1";
        ttSelect.addEventListener("change", () => loadAdminTimetablePdfs());
      }
    }
  }

  async function loadAdminHallsPage() {
    if (!requireAdminOnlyUI()) return;
    const tbody = document.getElementById("admin-halls-tbody");
    if (!tbody) return;

    const mapEl = document.getElementById("admin-hall-map");
    const latInput = document.getElementById("admin-hall-lat");
    const lngInput = document.getElementById("admin-hall-lng");
    const radiusInput = document.getElementById("admin-hall-radius");
    const universityId = document.getElementById("admin-university-select-halls")?.value;

    const syncCircle = () => {
      if (!adminHallMap || !adminHallMarker || !adminHallCircle) return;
      const lat = parseFloat(latInput?.value || "6.9271");
      const lng = parseFloat(lngInput?.value || "79.8612");
      const radius = Math.max(1, parseInt(radiusInput?.value || "80", 10));
      if (!isNaN(lat) && !isNaN(lng)) {
        adminHallMarker.setLatLng([lat, lng]);
        adminHallCircle.setLatLng([lat, lng]);
      }
      if (!isNaN(radius)) adminHallCircle.setRadius(radius);
    };

    if (mapEl && typeof L !== "undefined" && !adminHallMap) {
      const initLat = parseFloat(latInput?.value || "6.9271");
      const initLng = parseFloat(lngInput?.value || "79.8612");
      const initRadius = Math.max(1, parseInt(radiusInput?.value || "80", 10));
      adminHallMap = L.map(mapEl).setView([initLat, initLng], 16);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(adminHallMap);
      adminHallMarker = L.marker([initLat, initLng], { draggable: true }).addTo(adminHallMap);
      adminHallCircle = L.circle([initLat, initLng], { radius: initRadius, color: "#00c9a7" }).addTo(adminHallMap);

      adminHallMap.on("click", (e) => {
        if (latInput) latInput.value = e.latlng.lat.toFixed(7);
        if (lngInput) lngInput.value = e.latlng.lng.toFixed(7);
        syncCircle();
      });
      adminHallMarker.on("dragend", () => {
        const pos = adminHallMarker.getLatLng();
        if (latInput) latInput.value = pos.lat.toFixed(7);
        if (lngInput) lngInput.value = pos.lng.toFixed(7);
        syncCircle();
      });
      if (latInput && !latInput.dataset.mapBound) {
        latInput.dataset.mapBound = "1";
        latInput.addEventListener("input", syncCircle);
      }
      if (lngInput && !lngInput.dataset.mapBound) {
        lngInput.dataset.mapBound = "1";
        lngInput.addEventListener("input", syncCircle);
      }
      if (radiusInput && !radiusInput.dataset.mapBound) {
        radiusInput.dataset.mapBound = "1";
        radiusInput.addEventListener("input", syncCircle);
      }
      setTimeout(() => adminHallMap.invalidateSize(), 50);
    } else {
      syncCircle();
    }

    const form = document.getElementById("admin-add-hall-form");
    if (form && !form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const res = await post("/admin/lecture-halls", {
          admin_user_id: currentUser.id,
          university_id: document.getElementById("admin-university-select-halls")?.value,
          hall_name: document.getElementById("admin-hall-name")?.value,
          building_name: document.getElementById("admin-hall-building")?.value,
          floor_number: document.getElementById("admin-hall-floor")?.value,
          center_lat: document.getElementById("admin-hall-lat")?.value,
          center_lng: document.getElementById("admin-hall-lng")?.value,
          radius_m: document.getElementById("admin-hall-radius")?.value,
        });
        if (res && res.error) return alert(res.error);
        form.reset();
        await loadAdminHallsPage();
      });
    }

    const uniForm = document.getElementById("admin-add-university-form");
    if (uniForm && !uniForm.dataset.bound) {
      uniForm.dataset.bound = "1";
      uniForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("admin-university-name")?.value || "";
        const email = document.getElementById("admin-university-email")?.value || "";
        const res = await post("/admin/universities", {
          admin_user_id: currentUser.id,
          name,
          general_email: email,
        });
        if (res && res.error) return alert(res.error);
        uniForm.reset();
        universitiesCache = null;
        await loadAdminUniversitiesForHalls();
        await loadAdminHallsPage();
      });
    }

    if (!universityId) {
      tbody.innerHTML = "<tr><td colspan=\"7\">Select a university</td></tr>";
      return;
    }

    const halls = await get("/universities/" + universityId + "/halls").catch(() => []);
    tbody.innerHTML = halls.length
      ? halls
          .map(
            (h) => `
          <tr>
            <td>${h.hall_name}</td>
            <td>${h.building_name || "—"}</td>
            <td>${h.floor_number ?? "—"}</td>
            <td>${h.center_lat}</td>
            <td>${h.center_lng}</td>
            <td>${h.radius_m}</td>
            <td><button type="button" class="btn btn-ghost btn-small" data-hall-remove="${h.id}">Remove</button></td>
          </tr>
        `
          )
          .join("")
      : "<tr><td colspan=\"7\">No halls yet</td></tr>";

    tbody.querySelectorAll("[data-hall-remove]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-hall-remove");
        const res = await fetch(API + "/admin/lecture-halls/" + id, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ admin_user_id: currentUser.id }),
          credentials: "include",
        }).then((r) => r.json());
        if (res && res.error) return alert(res.error);
        await loadAdminHallsPage();
      });
    });
  }

  async function loadAdminTimetablePdfs() {
    if (!requireAdminOnlyUI()) return;
    const tbody = document.getElementById("admin-timetable-list-tbody");
    if (!tbody) return;
    const uni = document.getElementById("admin-university-select-timetable")?.value;
    const url = uni
      ? "/admin/timetable-pdfs?admin_user_id=" + currentUser.id + "&university_id=" + uni
      : "/admin/timetable-pdfs?admin_user_id=" + currentUser.id;
    const rows = await get(url).catch(() => []);
    tbody.innerHTML = rows.length
      ? rows
          .map(
            (r) => `
          <tr>
            <td>${r.semester}</td>
            <td><a href="/uploads/${String(r.file_path).split(/[\\\\/]/).pop()}" target="_blank">Open PDF</a></td>
            <td>${r.created_at ? String(r.created_at).slice(0, 10) : "—"}</td>
          </tr>
        `
          )
          .join("")
      : "<tr><td colspan=\"3\">No uploads yet</td></tr>";

    const form = document.getElementById("admin-timetable-upload-form");
    if (form && !form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const uid = document.getElementById("admin-university-select-timetable")?.value;
        const semester = document.getElementById("admin-timetable-semester")?.value || "";
        const fileInput = document.getElementById("admin-timetable-file");
        const file = fileInput?.files?.[0];
        if (!uid) return alert("Select a university");
        if (!semester) return alert("Enter semester");
        if (!file) return alert("Select a PDF file");

        const fd = new FormData();
        fd.append("admin_user_id", currentUser.id);
        fd.append("university_id", uid);
        fd.append("semester", semester);
        fd.append("file", file);

        const resp = await fetch(API + "/admin/timetable-pdfs", { method: "POST", body: fd, credentials: "include" });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok || json.error) return alert(json.error || "Upload failed");
        form.reset();
        await loadAdminTimetablePdfs();
      });
    }
  }

  async function loadAdminConcerns() {
    if (!requireAdminOnlyUI()) return;
    const tbody = document.getElementById("admin-concerns-tbody");
    if (!tbody) return;
    const status = document.getElementById("admin-concerns-status")?.value || "open";
    const rows = await get("/admin/concerns?admin_user_id=" + currentUser.id + "&status=" + status).catch(() => []);
    tbody.innerHTML = rows.length
      ? rows
          .map(
            (c) => `
          <tr>
            <td>${c.student_name || "—"}</td>
            <td>${c.university_name || "—"}</td>
            <td>${c.category || "—"}</td>
            <td>${c.status || "—"}</td>
            <td>${(c.message || "").slice(0, 220)}${(c.message || "").length > 220 ? "..." : ""}</td>
            <td>
              ${
                c.status === "forwarded"
                  ? "—"
                  : `<button type="button" class="btn btn-ghost btn-small" data-forward="${c.id}">Forward</button>`
              }
            </td>
          </tr>
        `
          )
          .join("")
      : "<tr><td colspan=\"6\">No concerns</td></tr>";

    tbody.querySelectorAll("[data-forward]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-forward");
        const res = await post("/admin/concerns/" + id + "/forward", { admin_user_id: currentUser.id });
        if (res && res.error) return alert(res.error);
        await loadAdminConcerns();
      });
    });

    const refreshBtn = document.getElementById("admin-refresh-concerns-btn");
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = "1";
      refreshBtn.addEventListener("click", () => loadAdminConcerns());
    }
    const statusSelect = document.getElementById("admin-concerns-status");
    if (statusSelect && !statusSelect.dataset.bound) {
      statusSelect.dataset.bound = "1";
      statusSelect.addEventListener("change", () => loadAdminConcerns());
    }
  }

  async function loadAdminUsage() {
    if (!requireAdminOnlyUI()) return;
    const days = 7;
    const summary = await get("/admin/analytics/usage-summary?admin_user_id=" + currentUser.id + "&days=" + days).catch(() => null);
    if (!summary) return;
    const rows = summary.rows || [];

    const total = rows.reduce((acc, r) => acc + (parseInt(r.count, 10) || 0), 0);
    document.getElementById("admin-total-events").textContent = total;

    // page_view + task_add split
    const pageViewRows = rows.filter((r) => r.event_type === "page_view");
    const taskAddRows = rows.filter((r) => r.event_type === "task_add");
    const pageViews = pageViewRows.reduce((acc, r) => acc + (parseInt(r.count, 10) || 0), 0);
    const taskAdds = taskAddRows.reduce((acc, r) => acc + (parseInt(r.count, 10) || 0), 0);
    document.getElementById("admin-total-page-views").textContent = pageViews;
    document.getElementById("admin-total-task-adds").textContent = taskAdds;

    const taskCompleteRows = rows.filter((r) => r.event_type === "task_complete");
    const taskCompletes = taskCompleteRows.reduce((acc, r) => acc + (parseInt(r.count, 10) || 0), 0);
    document.getElementById("admin-total-task-completes").textContent = taskCompletes;

    const attendanceRows = rows.filter((r) => r.event_type === "attendance_mark");
    const attendanceMarks = attendanceRows.reduce((acc, r) => acc + (parseInt(r.count, 10) || 0), 0);
    document.getElementById("admin-total-attendance-marks").textContent = attendanceMarks;

    const concernRows = rows.filter((r) => r.event_type === "concern_submit");
    const concernSubmits = concernRows.reduce((acc, r) => acc + (parseInt(r.count, 10) || 0), 0);
    document.getElementById("admin-total-concerns-submits").textContent = concernSubmits;

    const daysArr = Array.from(new Set(rows.map((r) => r.day))).sort();
    const pageByDay = daysArr.map((d) =>
      rows.filter((r) => r.day === d && r.event_type === "page_view").reduce((acc, r) => acc + (parseInt(r.count, 10) || 0), 0)
    );
    const taskByDay = daysArr.map((d) =>
      rows.filter((r) => r.day === d && r.event_type === "task_add").reduce((acc, r) => acc + (parseInt(r.count, 10) || 0), 0)
    );

    const ctx = document.getElementById("admin-usage-chart");
    if (ctx) {
      if (adminUsageChart) adminUsageChart.destroy();
      adminUsageChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: daysArr,
          datasets: [
            { label: "Page views", data: pageByDay, backgroundColor: "#00c9a7" },
            { label: "Task adds", data: taskByDay, backgroundColor: "#f59e0b" },
          ],
        },
        options: { responsive: true, maintainAspectRatio: true },
      });
    }

    const exportBtn = document.getElementById("admin-export-usage-excel");
    if (exportBtn && !exportBtn.dataset.bound) {
      exportBtn.dataset.bound = "1";
      exportBtn.addEventListener("click", () => {
        window.open(
          API + "/admin/analytics/usage-export-excel?admin_user_id=" + currentUser.id + "&days=" + days,
          "_blank"
        );
      });
    }
  }

  // ==============================
  // Admin: attendance verification queue
  // ==============================

  async function loadAdminAttendanceQueue() {
    if (!requireAdminOnlyUI()) return;
    const tbody = document.getElementById("admin-attendance-queue-tbody");
    if (!tbody) return;

    const statusSel = document.getElementById("admin-attendance-queue-status");
    const status = statusSel?.value || "";
    const refreshBtn = document.getElementById("admin-attendance-queue-refresh");

    const url = status
      ? "/admin/attendance-queue?admin_user_id=" + currentUser.id + "&status=" + status
      : "/admin/attendance-queue?admin_user_id=" + currentUser.id;

    const rows = await get(url).catch(() => []);

    tbody.innerHTML = rows.length
      ? rows
          .map(
            (r) => {
              const hallText = r.hall_name ? `${r.hall_name}${r.building_name ? " (" + r.building_name + ")" : ""}` : "—";
              const proofLink = r.proof_path
                ? `<a href="/uploads/${String(r.proof_path).split(/[\\\\/]/).pop()}" target="_blank">View</a>`
                : "—";
              const attendanceText = `${r.attended}/${r.total_sessions}`;

              const canModerate = r.verification_status === "pending" || r.verification_status === "timetable_missing";
              return `
                <tr>
                  <td>${r.student_name || "—"}</td>
                  <td>${r.module_name || "—"}</td>
                  <td>${r.university_name || "—"}</td>
                  <td>${hallText}</td>
                  <td>${r.delivery_mode || "—"}</td>
                  <td>${r.lecture_date ? String(r.lecture_date).slice(0, 10) : "—"}</td>
                  <td>${attendanceText}</td>
                  <td>${r.verification_status || "—"}</td>
                  <td>${proofLink}</td>
                  <td>
                    ${
                      canModerate
                        ? `<div class="actions">
                            <button type="button" class="btn btn-ghost btn-small" data-approve="${r.id}">Approve</button>
                            <button type="button" class="btn btn-danger-outline btn-small" data-reject="${r.id}">Reject</button>
                           </div>`
                        : "—"
                    }
                  </td>
                </tr>
              `;
            }
          )
          .join("")
      : "<tr><td colspan=\"10\">No pending items</td></tr>";

    tbody.querySelectorAll("[data-approve]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-approve");
        const res = await post("/admin/attendance-queue/" + id + "/approve", { admin_user_id: currentUser.id });
        if (res && res.error) return alert(res.error);
        await loadAdminAttendanceQueue();
      });
    });

    tbody.querySelectorAll("[data-reject]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-reject");
        const res = await post("/admin/attendance-queue/" + id + "/reject", { admin_user_id: currentUser.id });
        if (res && res.error) return alert(res.error);
        await loadAdminAttendanceQueue();
      });
    });

    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = "1";
      refreshBtn.addEventListener("click", () => loadAdminAttendanceQueue());
    }
    if (statusSel && !statusSel.dataset.bound) {
      statusSel.dataset.bound = "1";
      statusSel.addEventListener("change", () => loadAdminAttendanceQueue());
    }
  }

  // ==============================
  // Delete Profile
  // ==============================

  const deleteOverlay = document.getElementById("delete-profile-overlay");
  const deleteConfirmBtn = document.getElementById("delete-profile-confirm");
  const deleteCancelBtn = document.getElementById("delete-profile-cancel");

  document.getElementById("delete-profile-btn").addEventListener("click", () => {
    if (deleteOverlay) deleteOverlay.classList.add("active");
  });

  if (deleteCancelBtn) {
    deleteCancelBtn.addEventListener("click", () => {
      if (deleteOverlay) deleteOverlay.classList.remove("active");
    });
  }

  if (deleteOverlay) {
    deleteOverlay.addEventListener("click", (e) => {
      if (e.target === deleteOverlay) deleteOverlay.classList.remove("active");
    });
  }

  if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener("click", async () => {
      try {
        await del("/users/" + currentUser.id);
        currentUser = null;
        document.getElementById("app").classList.add("hidden");
        document.getElementById("auth-screen").classList.remove("hidden");
        document.getElementById("register-screen").classList.add("hidden");
        if (deleteOverlay) deleteOverlay.classList.remove("active");
      } catch (err) {
        alert("Failed to delete profile. Please try again.");
      }
    });
  }

  // ==============================
  // Geofence (attendance) – circle based on admin-configured lecture halls
  // ==============================

  function initGeofence() {
    const checkBtn = document.getElementById("check-geofence-btn");
    const statusCard = document.getElementById("geofence-status-card");
    const statusText = document.getElementById("geofence-status-text");
    const statusDetail = document.getElementById("geofence-status-detail");
    const markSection = document.getElementById("attendance-mark-section");
    const outsideMsg = document.getElementById("geofence-outside-msg");

    if (!checkBtn) return;

    checkBtn.addEventListener("click", async () => {
      const mode = document.getElementById("attendance-delivery-mode")?.value || "offline";
      if (mode === "online") {
        statusCard.classList.remove("outside");
        statusCard.classList.add("within");
        statusText.textContent = "Online lecture mode enabled";
        statusDetail.textContent = "Geofence is not required for online lecture submissions. Upload proof and mark attendance.";
        if (markSection) markSection.classList.remove("hidden");
        if (outsideMsg) outsideMsg.classList.add("hidden");
        return;
      }

      checkBtn.disabled = true;
      checkBtn.textContent = "Checking...";
      statusText.textContent = "Verifying location...";
        statusDetail.textContent = "Getting your GPS position...";
      statusCard.classList.remove("within", "outside");

      const domUniId = parseInt(document.getElementById("attendance-university-select")?.value, 10);
      if (!domUniId || isNaN(domUniId)) {
        alert("Please select a university first.");
        checkBtn.disabled = false;
        checkBtn.textContent = "Check location";
        statusText.textContent = "Check your location to mark attendance";
      statusDetail.textContent = "Tap \"Check location\" after selecting a university to verify by GPS";
        return;
      }

      selectedAttendanceUniversityId = domUniId;
      attendanceHalls = await get("/universities/" + domUniId + "/halls").catch(() => []);
      if (!attendanceHalls || attendanceHalls.length === 0) {
        alert("No lecture hall geofences configured for this university yet.");
        checkBtn.disabled = false;
        checkBtn.textContent = "Check location";
        statusText.textContent = "Check your location to mark attendance";
        statusDetail.textContent = "Ask your admin to configure lecture hall circles.";
        return;
      }

      const onSuccess = (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const selectedHallId = document.getElementById("attendance-hall-select")?.value || "";
        const restrictToHall = mode === "offline" && selectedHallId;

        let within = false;
        let nearestHall = null;
        let nearestDist = Infinity;

        for (const h of attendanceHalls) {
          if (restrictToHall && String(h.id) !== String(selectedHallId)) continue;
          const dist = haversineMeters(lat, lng, parseFloat(h.center_lat), parseFloat(h.center_lng));
          if (dist <= parseFloat(h.radius_m)) {
            within = true;
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestHall = h;
            }
          }
        }

        statusCard.classList.add(within ? "within" : "outside");
        statusText.textContent = within ? "Within a lecture hall geofence ✓" : "Outside lecture hall geofences";
        statusDetail.textContent = within
          ? `You are inside: ${nearestHall.hall_name}${nearestHall.building_name ? " (" + nearestHall.building_name + ")" : ""}`
          : "Move within the designated lecture hall area and try again.";

        if (markSection) markSection.classList.toggle("hidden", !within);
        if (outsideMsg) outsideMsg.classList.toggle("hidden", within);

        if (within) trackUsage("attendance_geofence_ok", "attendance", { hall_id: nearestHall?.id || null, university_id: selectedAttendanceUniversityId });

        checkBtn.disabled = false;
        checkBtn.textContent = "Check location";
      };

      const onError = () => {
        statusCard.classList.add("outside");
        statusText.textContent = "Location unavailable";
        statusDetail.textContent = "Please enable location services and try again.";
        if (markSection) markSection.classList.add("hidden");
        if (outsideMsg) outsideMsg.classList.remove("hidden");
        checkBtn.disabled = false;
        checkBtn.textContent = "Check location";
      };

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(onSuccess, onError, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      } else {
        onError();
      }
    });
  }

  initGeofence();

  // ==============================
  // PDF Report
  // ==============================

  document.getElementById("download-report").addEventListener("click", () => {
    window.open(API + "/users/" + currentUser.id + "/report.pdf", "_blank");
  });

  // ==============================
  // Logout
  // ==============================

  document.getElementById("logout-btn").addEventListener("click", () => {
    currentUser = null;
    post("/logout", {}).catch(() => {});
    document.getElementById("app").classList.add("hidden");
    document.getElementById("auth-screen").classList.remove("hidden");
    document.getElementById("register-screen").classList.add("hidden");
  });

  // ==============================
  // Auth form listeners
  // ==============================

  document.getElementById("login-form").addEventListener("submit", login);
  document.getElementById("register-form").addEventListener("submit", register);

  document.getElementById("show-register").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("auth-screen").classList.add("hidden");
    document.getElementById("register-screen").classList.remove("hidden");
  });
  document.getElementById("show-login").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("register-screen").classList.add("hidden");
    document.getElementById("auth-screen").classList.remove("hidden");
  });

  // ==============================
  // Init form listeners (run once; they use currentUser on submit)
  // ==============================

  initGpaFormAndGoalPlanner();
  initAttendance();
  initTasksForm();
  tryResumeSession();
})();
