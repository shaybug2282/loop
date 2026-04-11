# Workflow
- Be sure to typecheck when you're done making a series of code changes
- once a change has been made, write to a file in the working directory where the change was made. If one does not already exist, create it. write a brief (maximum 3 sentences) explanation of what changed and what potential bugs need to be resolved.
- emphasize usage efficiency.
- when a function is created, comment a short description of the intention and expected output.

# Project Overview
- This project will ultimately be an AI tool that can read, edit, and sync calendar events across multiple users based on user input. User can prompt AI to suggest times to schedule shared events between multiple users' calendars.
- Project will also offer interface to manage contacts within the app and daily tasks.
- Project will prioritize intuitive user interface.

# Project Interfacing
- This website will eventually interface with many other applications, including GSuite apps, Outlook, and Apple apps. When creating these interfaces, must include specific framework to allow for smooth interfacing with each different client.
- ensure interfacing is seamless as possible on user end. implement automatic token refresh. limit permission requests to the most narrow necessary scope.

# Architecture
- Project is being deployed through Vercel. 
- Backend database will be handled by Supabase.