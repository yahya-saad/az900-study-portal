# 🎓 Azure AZ-900 Study Portal

A high-performance, offline-first practice exam engine and simulator for the Microsoft Azure Fundamentals (AZ-900) certification. Built with zero dependencies using vanilla HTML/CSS/JavaScript.

---

## 🚀 Quick Start

### 1. Compile Questions Database
```bash
node data/parse_data.js
```

### 2. Launch Local Server
```bash
node server.js
```
Access the portal at **[http://localhost:3000](http://localhost:3000)**.

---

## 🌟 Key Features

- **Practice Mode**: Test yourself sequentially or shuffled, reveal answers with immediate feedback, and jump to specific questions. Progress is auto-saved.
- **Exam Simulator**: Take full-length simulated exams under a custom timer. Resuming mid-exam after browser reload is supported.
- **Dynamic Search**: Instant keyword-based question lookup to create custom playlists.
- **Flagging & Bookmarks**: Star difficult questions and review them later.
- **Attempts History**: Track score progress, date/time, and review question selections of past exam attempts (paginated and date-filtered).

---

## ⌨️ Keyboard Shortcuts

Speed up study sessions using mapped controls (active in practice and exam views when not typing in inputs):

| Key | Action | Context |
| :--- | :--- | :--- |
| **`ArrowDown` / `ArrowUp`** | Focus options vertically (premium Indigo glow highlight) | Practice & Exam Views |
| **`Space`** | Toggle selection of the focused option (or reveal in Practice) | Practice & Exam Views |
| **`1` - `5`** or **`A` - `E`** | Select option 1 through 5 directly | Practice & Exam Views |
| **`ArrowRight`** or **`Enter`** | Advance to next question / select focused option | Practice & Exam Views |
| **`ArrowLeft`** | Return to previous question | Practice View Only |
| **`R`** | Reveal answer directly | Practice View Only |
| **`S`** | Skip question | Exam View Only |

---

## 📂 Project Structure

```text
├── data/
│   ├── data.md             # Raw practice questions markdown source
│   ├── parse_data.js       # Node compiler to validate & generate JSON
│   └── questions.json      # Compiled JSON questions database
├── src/
│   ├── app.js              # State manager and exam controller logic
│   └── styles.css          # Responsive design stylesheet and UI tokens
├── index.html              # Main Single Page Application entry point
├── server.js               # Built-in lightweight HTTP server
└── README.md               # Project documentation
```

---

## 🚢 CI/CD Deployment

This app is configured to compile and deploy automatically to **GitHub Pages** using GitHub Actions:
1. Push your code to your repository.
2. In your repository page, go to **Settings** -> **Pages**.
3. Under **Build and deployment** -> **Source**, select **GitHub Actions**.
4. The workflow in `.github/workflows/deploy.yml` will automatically trigger, compile, and host your app.
