# Setting Up Your Obsidian Plugin Template on GitHub

This guide will walk you through setting up this template repository on GitHub so you can use it for all your future Obsidian plugins.

## Step 1: Create a New Repository on GitHub

1. Go to [GitHub](https://github.com) and sign in
2. Click the **"+"** icon in the top right corner
3. Select **"New repository"**
4. Fill in the repository details:
   - **Repository name**: `obsidian-plugin-template` (or your preferred name)
   - **Description**: "A minimal template for Obsidian plugins"
   - **Visibility**: Public (required for use as a template)
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
5. Click **"Create repository"**

## Step 2: Initialize Git and Push to GitHub

```bash
# Navigate to the template directory
cd obsidian-plugin-template

# Initialize git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Obsidian plugin template"

# Add your GitHub repository as remote
git remote add origin https://github.com/YOUR_USERNAME/obsidian-plugin-template.git

# Push to GitHub
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

## Step 3: Configure as a Template Repository

1. Go to your repository on GitHub: `https://github.com/YOUR_USERNAME/obsidian-plugin-template`
2. Click on **"Settings"** (top navigation bar)
3. Scroll down to the **"Template repository"** section
4. Check the box that says **"Template repository"**

**That's it!** Your repository is now a template.

## Step 4: Using Your Template for New Projects

Whenever you want to create a new Obsidian plugin:

1. Go to your template repository on GitHub
2. Click the green **"Use this template"** button (near the top of the page)
3. Select **"Create a new repository"**
4. Fill in the details for your new plugin:
   - Repository name (e.g., `obsidian-my-plugin`)
   - Description
   - Public/Private
5. Click **"Create repository"**
6. Clone your new repository and follow the setup steps in the README.md

## Step 5: Keep Your Template Updated

As you improve your development workflow, you can update the template:

```bash
# Make changes to your template
git add .
git commit -m "Update: description of changes"
git push origin main
```

All future projects created from the template will use the latest version at the time of creation.

## Optional: Add Template Badges

Add these badges to your template's README.md to make it look more professional:

```markdown
![GitHub release](https://img.shields.io/github/v/release/YOUR_USERNAME/obsidian-plugin-template)
![License](https://img.shields.io/github/license/YOUR_USERNAME/obsidian-plugin-template)
```

## Troubleshooting

### "Template repository" option is not available

- Make sure your repository is **Public**. Private repositories cannot be templates.
- Make sure you're in the repository settings, not your account settings.

### GitHub Actions not running

- Make sure Actions are enabled: Go to Settings > Actions > General
- Check that "Allow all actions and reusable workflows" is selected

### Build failing in GitHub Actions

- Verify all dependencies are in `package.json`
- Test the build locally with `npm run build` before pushing

## Next Steps

Once your template is set up, check out the main [README.md](README.md) for how to use it to create new plugins.
