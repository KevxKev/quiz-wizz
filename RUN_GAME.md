# Run QuizWiz Locally

This is the fastest way to start the game.

## 1) Open the project

Open **VS Code** and open this folder:

```text
C:\Users\kevin\OneDrive\Desktop\Quiz Wizz
```

## 2) Start the server

Open a terminal in that folder and run this exact command:

```bash
npm run dev -- --hostname 0.0.0.0 --port 3001
```

Wait until the terminal says the app is ready.

## 3) Open the host screen on the computer

On the computer running the game, open:

```text
http://localhost:3001/host
```

## 4) Let phones join on your Wi-Fi

1. Make sure the phones are on the **same Wi-Fi** as the computer.
2. On the computer, open **Command Prompt** and run:

```bash
ipconfig
```

3. Find the line called **IPv4 Address**.
   It will look something like this:

```text
192.168.2.15
```

4. On each phone, open:

```text
http://YOUR-IP:3001/join
```

Example:

```text
http://192.168.2.15:3001/join
```

## Troubleshooting

### Port already in use

If the terminal says the port is already in use:

- close any old QuizWiz terminal windows
- then run the command again

If needed, restart the computer and try again.

### Phone cannot connect

If a phone cannot connect:

- make sure the phone and computer are on the **same Wi-Fi**
- make sure you used the computer's **IPv4 Address**
- make sure the server is still running in the terminal
- try turning Windows Firewall off briefly to test
- refresh the page on the phone
