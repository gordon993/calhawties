let password = "";
let rows = [];
let sortKey = "win_rate";
let sortDir = -1;

const loginView = document.getElementById("login-view");
const resultsView = document.getElementById("results-view");
const passwordInput = document.getElementById("password-input");
const loginError = document.getElementById("login-error");

async function fetchResults() {
  const res = await fetch(`/api/results?password=${encodeURIComponent(password)}`);
  if (res.status === 401) throw new Error("Wrong password.");
  if (!res.ok) throw new Error("Could not load results.");
  const data = await res.json();
  return data.rows;
}

function renderTable() {
  const sorted = rows.slice().sort((a, b) => {
    const av = a[sortKey] ?? -Infinity;
    const bv = b[sortKey] ?? -Infinity;
    if (av < bv) return -1 * sortDir;
    if (av > bv) return 1 * sortDir;
    return 0;
  });
  const tbody = document.querySelector("#results-table tbody");
  tbody.innerHTML = sorted
    .map(
      (r) => `<tr>
        <td>${r.caption}</td>
        <td>${r.appearances}</td>
        <td>${r.wins}</td>
        <td>${r.losses}</td>
        <td>${r.win_rate === null ? "—" : (r.win_rate * 100).toFixed(1) + "%"}</td>
        <td>${r.championships}</td>
      </tr>`
    )
    .join("");
}

async function loadAndShow() {
  loginError.textContent = "";
  try {
    rows = await fetchResults();
  } catch (err) {
    loginError.textContent = err.message;
    return;
  }
  loginView.style.display = "none";
  resultsView.style.display = "block";
  renderTable();
}

document.getElementById("login-btn").addEventListener("click", () => {
  password = passwordInput.value;
  loadAndShow();
});

passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("login-btn").click();
});

document.getElementById("refresh-btn").addEventListener("click", loadAndShow);

document.getElementById("csv-btn").addEventListener("click", async () => {
  const res = await fetch(`/api/results?format=csv&password=${encodeURIComponent(password)}`);
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "results.csv";
  a.click();
  URL.revokeObjectURL(url);
});

document.querySelectorAll("th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (sortKey === key) sortDir *= -1;
    else {
      sortKey = key;
      sortDir = -1;
    }
    renderTable();
  });
});
