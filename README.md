# React Hello World App

A simple React application ready to deploy on Vercel.

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm start
```

The app will open at [http://localhost:3000](http://localhost:3000)

### Building for Production

```bash
npm run build
```

This creates an optimized production build in the `build` folder.

## Deploy to Vercel

### Option 1: Deploy via Vercel CLI

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Deploy:
```bash
vercel
```

### Option 2: Deploy via Vercel Dashboard

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click "Import Project"
4. Select your repository
5. Vercel will auto-detect the React settings and deploy

## Project Structure

```
react-hello-world/
├── public/
│   └── index.html          # HTML template
├── src/
│   ├── App.css            # App component styles
│   ├── App.js             # Main App component
│   ├── index.css          # Global styles
│   └── index.js           # Entry point
├── .gitignore             # Git ignore rules
├── package.json           # Dependencies and scripts
├── README.md              # This file
└── vercel.json            # Vercel configuration
```

## Available Scripts

- `npm start` - Runs the app in development mode
- `npm run build` - Builds the app for production
- `npm test` - Runs the test suite
- `npm run eject` - Ejects from Create React App (one-way operation)

## Learn More

- [React Documentation](https://reactjs.org/)
- [Vercel Documentation](https://vercel.com/docs)
