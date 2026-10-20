![](https://img.shields.io/badge/Foundry-v14-informational)
![Latest Release Download Count](https://img.shields.io/github/downloads/FolkvangrForgent/token-stack-picker/latest/module.zip)
![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Ftoken-stack-picker&colorB=4aa94a)

> **AI Disclaimer** - This module was created with the heavy use of AI coding. I have credited the AI model used as an author. Manual reviews and changes were made many times during the creation of this module.

# Token Stack Picker

This module aims to make it easier to target or open sheets of tokens that are on top of each other. This should work on all systems but is used and tested on the PF2e and SF2e systems. If you are looking for a particular feature or are having an issue please open up an `Issue`!

![Example of token stack picker window](image.png)

## Usage

1. Hover over a stack of tokens on the canvas
2. Press `G` to open a window that shows a grid of portraits for each visible token under the cursor
3. Below are all the actions that can be performed and what they do:

| Action                  | Description                           |
| ----------------------- | ------------------------------------- |
| Core Target Keybind     | Toggle targeting token                |
| `Left Click`            | Target token                          |
| `Alt` + `Left Click`    | Remove token from targeted token(s)   |
| `Shift` + `Left Click`  | Add token to targeted token(s)        |
| `Right Click`           | Control token                         |
| `Alt` + `Right Click`   | Remove token from controlled token(s) |
| `Shift` + `Right Click` | Add token to controlled token(s)      |
| `Middle Click`          | Open actor sheet of token             |

4. To close the window do any of the following:
- Press `Esc`
- Move Pointer outside window
- Click outside window

## Token Portraits

The token portraits have the following elements:
- Hovered token outline: Shows what token actions would be on
- Controlled token outline: Shows what token(s) in the window are currently being controlled
- Targeted token arrows: Shows what token(s) in the window are currently being targeted
- Colored pips: Shows what token(s) in the window are currently being targeted by other users

## Settings

| Setting       | Scope  | Default   | Description                                                                   |
| ------------- | ------ | --------- | ----------------------------------------------------------------------------- |
| Use Actor Art | World  | `Off`     | Show actor images instead of token images                                     |
| Portrait Size | Client | `100`     | Size in pixels of each token portrait in the grid (50 to 200, in steps of 10) |
| Grid Columns  | Client | `3`       | Maximum number of portraits per row in the grid (1 to 6)                      |
| Target Color  | Client | `#33BBEE` | Color of the arrows on targeted token(s)                                      |
| Control Color | Client | `#EE7733` | Color of the highlight on controlled token(s)                                 |

## Keybindings

| Action                             | Default       | Description                                                                                                      |
| ---------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Open Token Stack Picker            | `G`           | Open the token stack picker window at the current mouse position                                                 |
| Open Token Stack Picker (Untarget) | `Alt` + `G`   | Remove every visible token under the current mouse position from targeted tokens, then open the window as normal |
| Open Token Stack Picker (Target)   | `Shift` + `G` | Add every visible token under the current mouse position to targeted tokens, then open window as normal          |

## API

Macros can open the token stack picker window with the provided API:
```js
const api = game.modules.get('token-stack-picker').api;
// At the current mouse position
api.open();
// At a specific point, in canvas coordinates
api.open({ position: { x: 1200, y: 800 } });
// At the current mouse position, also targeting every token in the stack
api.open({ mode: 'target' });
// At the current mouse position, also untargeting every token in the stack
api.open({ mode: 'untarget' });
```

`api.open` takes a single optional options object:

| `position` | Description                                       |
| ---------- | ------------------------------------------------- |
| `{ x, y }` | Point in canvas coordinates to open the window at |

| `mode`       | Description                                                           |
| ------------ | --------------------------------------------------------------------- |
| `'target'`   | Add every visible token to targeted tokens (same as `Shift` + `G`)    |
| `'untarget'` | Remove every visible token from targeted tokens (same as `Alt` + `G`) |

## Languages

- English
