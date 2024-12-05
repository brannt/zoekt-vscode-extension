# Zoekt Code Search VSCode Extension

## Overview
This VSCode extension provides powerful, efficient code searching capabilities using the Zoekt indexing and search tool.

## Prerequisites
- Zoekt must be installed on your system
- Ensure `zoekt-index` and `zoekt` binaries are in your system PATH

## Features
- Index entire workspace for lightning-fast code search
- Perform quick searches across your codebase
- Supports large repositories with efficient indexing

## Usage
1. Open a workspace in VSCode
2. Use the following commands:
   - `Zoekt: Index Current Workspace` - Creates an index of your current project
   - `Zoekt: Search Code` - Opens a search prompt to find code across your project

## Installation
1. Clone this repository
2. Run `npm install`
3. Press `F5` to launch the extension in debug mode

## Configuration
No additional configuration is required. Ensure Zoekt binaries are installed.

## Requirements
- VSCode 1.80.0 or higher
- Zoekt installed on your system

## Troubleshooting
- Ensure Zoekt binaries are in your system PATH
- Check the output channel for detailed indexing and search logs

## License
MIT License
