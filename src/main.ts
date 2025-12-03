import { Plugin } from "obsidian"

export default class MyPlugin extends Plugin {
  async onload() {
    console.log("Loading plugin")

    // Add a ribbon icon
    this.addRibbonIcon("dice", "Sample Plugin", (evt: MouseEvent) => {
      console.log("Ribbon icon clicked")
    })

    // Add a simple command
    this.addCommand({
      id: "sample-command",
      name: "Sample Command",
      callback: () => {
        console.log("Sample command executed")
      },
    })
  }

  onunload() {
    console.log("Unloading plugin")
  }
}
