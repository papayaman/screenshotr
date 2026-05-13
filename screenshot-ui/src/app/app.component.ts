// app.component.ts
import { Component, inject, ViewEncapsulation, OnInit } from '@angular/core'; 
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AutomationService } from './services/automation.service';
import { firstValueFrom } from 'rxjs'; 
import { environment } from '../environments/environment';

export interface ScreenshotTask {
  name: string;
  url: string; 
  width: number;
  height: number | "full";
  clickSelectors?: string[]; 
  scrollToSelector?: string; 
  waitDelay?: number;
  clearCache?: boolean;
  globalCss?: string;
  itemCss?: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  encapsulation: ViewEncapsulation.None, 
  
  styles: [`
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      --bg-body: #ffffff;
      --bg-panel: #f8f9fa;
      --bg-card: #ffffff;
      --bg-input: #ffffff;
      --bg-highlight: #e3f2fd;
      --text-main: #333333;
      --text-muted: #666666;
      --text-accent: #0d47a1;
      --border-main: #dee2e6;
      --border-input: #cccccc;

      margin: 0; /* This removes the default 8px white ring around the browser! */
      background-color: var(--bg-body);
      color: var(--text-main);
      transition: background-color 0.3s, color 0.3s;
    }
    
    body[data-theme="dark"] {
      --bg-body: #121212;
      --bg-panel: #1e1e1e;
      --bg-card: #242424;
      --bg-input: #2d2d2d;
      --bg-highlight: #003366; 
      --text-main: #e0e0e0;
      --text-muted: #aaaaaa;
      --text-accent: #90caf9; 
      --border-main: #444444;
      --border-input: #555555;
    }

    input, select, textarea, button {
      color: var(--text-main);
    }
    input::placeholder, textarea::placeholder {
      color: var(--text-muted);
    }

    .options-btn:hover {
      background: var(--bg-highlight) !important;
      border-color: var(--text-accent) !important;
      color: var(--text-accent) !important;
    }

    .options-btn:hover {
      background: var(--bg-highlight) !important;
      border-color: var(--text-accent) !important;
      color: var(--text-accent) !important;
    }

    .record-btn:not(:disabled):hover {
      background: var(--bg-highlight) !important;
      border-color: var(--text-accent) !important;
    }
  `]
})
export class AppComponent implements OnInit {
  automationService = inject(AutomationService);
  
  // UI State
  statusMessage = '';
  isExecuting = false;
  isPaused = false;
  isCancelled = false;
  completedTasks = 0;
  executionStatus = '';
  recordingIndex: number | null = null;
  previewingIndex: number | null = null;
  isSavingLocal = false;
  draggedIndex: number | null = null;
  isDarkMode = false;
  currentFilename: string = environment.defaultFilename.replace(/\.json$/i, '');
  downloadUrl: string | null = null;
  recentLocalFiles: string[] = [];
  isLoadingRecents = false;
  fileToDelete: string | null = null;

  ngOnInit() {
    // 🌟 FIX: Safety check for Angular SSR. 
    // If we are on the Node server, stop immediately. Only run in the browser!
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return; 
    }

    // 1. Check if the user previously saved a manual preference
    const savedTheme = localStorage.getItem('ui-theme-preference');

    // 2. Create a listener for the OS system theme
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');

    // 3. Determine the initial load state
    if (savedTheme) {
      // If they manually toggled it before, respect their choice
      this.applyTheme(savedTheme === 'dark');
    } else {
      // Otherwise, follow the system!
      this.applyTheme(systemPrefersDark.matches);
    }

    // 4. Listen for live changes (e.g., OS switches at sunset)
    systemPrefersDark.addEventListener('change', (event) => {
      // Only auto-switch if the user hasn't manually locked in a preference
      if (!localStorage.getItem('ui-theme-preference')) {
        this.applyTheme(event.matches);
      }
    });

    this.refreshRecents();
  }

  // Helper method to safely update the DOM and state
  applyTheme(isDark: boolean) {
    this.isDarkMode = isDark;
    if (isDark) {
      document.body.setAttribute('data-theme', 'dark');
    } else {
      document.body.removeAttribute('data-theme');
    }
  }

  // The button click handler
  toggleTheme() {
    // Flip the current state
    this.applyTheme(!this.isDarkMode);
    
    // Save their manual choice so the OS doesn't override it on next refresh
    localStorage.setItem('ui-theme-preference', this.isDarkMode ? 'dark' : 'light');
  }

  config = {
    globalWaitDelay: 1000,
    globalCss: "",
    baseUrl: "https://", 
    desktopWidth: 1440,
    mobileWidth: 390,
    tasks: [
      { name: '', url: '', width: 1440, height: "full" } as ScreenshotTask
    ]
  };

  addTask() {
    const newTask = { 
      name: '', 
      url: '', 
      width: this.config.desktopWidth, 
      height: "full" 
    } as ScreenshotTask;
    
    this.config.tasks.push(newTask);
    this.expandedTasks.add(newTask); // Pop it open in the UI!
  }

  removeTask(index: number) {
    this.config.tasks.splice(index, 1);
  }

  duplicateTask(index: number) {
    const taskToCopy = this.config.tasks[index];
    
    // Create a pristine, completely disconnected clone
    const clonedTask: ScreenshotTask = JSON.parse(JSON.stringify(taskToCopy));
    
    // Optionally tweak the name so you know it's a clone
    if (clonedTask.name) {
      clonedTask.name = `${clonedTask.name} (Copy)`;
    }

    // Insert the clone into the array immediately after the current index
    this.config.tasks.splice(index + 1, 0, clonedTask);
  }

  updateClickSelectors(task: ScreenshotTask, event: string) {
    task.clickSelectors = event ? event.split(',').map(s => s.trim()) : undefined;
  }

  importConfig(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const fileContent = e.target?.result as string;
        const importedData = JSON.parse(fileContent);

        if (importedData && Array.isArray(importedData.tasks)) {
          this.config = {
            ...this.config,
            ...importedData
          };
          this.currentFilename = file.name.replace(/\.json$/i, '');
          this.statusMessage = `✅ Successfully imported ${this.config.tasks.length} tasks from ${file.name}`;
          input.value = '';
        } else {
          alert('Invalid configuration file. It must contain a "tasks" array.');
        }
      } catch (error) {
        console.error('Error parsing file:', error);
        alert('Failed to parse the file. Please ensure it is valid JSON.');
      }
    };
    reader.readAsText(file);
  }

  async refreshRecents() {
    this.isLoadingRecents = true;
    try {
      const recents = await firstValueFrom(this.automationService.getRecentFiles());
      this.recentLocalFiles = recents.local || [];
    } catch (e) {
      console.error("Could not load recents");
    } finally {
      this.isLoadingRecents = false;
    }
  }

  async loadRecentFile(filename: string) {
    this.statusMessage = `⏳ Loading ${filename}...`;
    try {
      const importedData = await firstValueFrom(this.automationService.loadConfigFile(filename));
      
      if (importedData && Array.isArray(importedData.tasks)) {
        this.config = { ...this.config, ...importedData };
        this.currentFilename = filename.replace(/\.json$/i, '');
        this.statusMessage = `✅ Successfully loaded ${this.config.tasks.length} tasks from ${filename}`;
        
        // Ensure UI expands tasks if needed, or close them
        this.expandedTasks.clear();
      } else {
        this.statusMessage = '❌ Invalid configuration file format.';
      }
    } catch (error) {
      this.statusMessage = `❌ File not found on your machine. Try clicking 'Push to GitHub' to sync.`;
    } finally {
      setTimeout(() => this.statusMessage = '', 4000);
    }
  }

  // File Management
  private enforceJsonExtension(filename: string): string {
    let cleanName = filename.trim();
    if (!cleanName.toLowerCase().endsWith('.json')) {
      cleanName += '.json';
    }
    return cleanName;
  }

  async saveConfigLocally() {
    const fileToSave = this.currentFilename.endsWith('.json') 
      ? this.currentFilename 
      : `${this.currentFilename}.json`;
    
    this.isSavingLocal = true;
    this.statusMessage = '💾 Saving locally...';
    try {
      await firstValueFrom(this.automationService.saveLocalConfig(fileToSave, this.config));
      this.statusMessage = `✅ Saved as ${fileToSave}`;
      this.refreshRecents(); 
    } catch (error) {
      this.statusMessage = '❌ Failed to save locally.';
    } finally {
      this.isSavingLocal = false;
      setTimeout(() => this.statusMessage = '', 4000);
    }
  }

  // Execution Controls
  togglePause() {
    this.isPaused = !this.isPaused;
    this.executionStatus = this.isPaused ? '⏸️ Paused by user...' : '▶️ Resuming...';
  }

  cancelExecution() {
    this.isCancelled = true;
    this.isExecuting = false;
    this.executionStatus = '🛑 Cancelling... waiting for current task to finish.';
  }

  // =========================================================================
  // NEW COMPILER HELPER: Merges Global Data into the Task before executing
  // =========================================================================
  buildCompiledTask(task: ScreenshotTask, index: number): ScreenshotTask {
    let fullUrl = task.url;
    
    if (this.config.baseUrl && !task.url.startsWith('http')) {
      const base = this.config.baseUrl.replace(/\/$/, ''); 
      const path = task.url.replace(/^\//, ''); 
      fullUrl = `${base}/${path}`;
    }

    const totalTasks = this.config.tasks.length;
    const padLength = Math.max(2, totalTasks.toString().length);
    
    const prefix = String(index + 1).padStart(padLength, '0') + '-';
    const finalName = `${prefix}${task.name || 'screenshot'}`;

    const combinedCss = [this.config.globalCss, task.itemCss]
                          .filter(Boolean) // Ignores undefined or empty strings
                          .join('\n\n');   // Safely spaces them apart

    return { 
      ...task, 
      url: fullUrl, 
      name: finalName,
      globalCss: combinedCss // The backend will inject both seamlessly!
    };
  }

  // =========================================================================
  // NATIVE DRAG AND DROP METHODS
  // =========================================================================
  onDragStart(index: number) {
    this.draggedIndex = index;
  }

  onDragOver(event: DragEvent) {
    // Necessary to allow dropping
    event.preventDefault(); 
  }

  onDrop(dropIndex: number) {
    if (this.draggedIndex !== null && this.draggedIndex !== dropIndex) {
      // Remove the item from its original spot
      const movedItem = this.config.tasks.splice(this.draggedIndex, 1)[0];
      // Insert it into the new spot
      this.config.tasks.splice(dropIndex, 0, movedItem);
    }
    this.draggedIndex = null;
  }

  // Apply compiler to Recording
  async startRecording(task: ScreenshotTask, index: number) {
    if (!task.url && !this.config.baseUrl) {
      alert("Please enter a URL first before recording.");
      return;
    }

    const payloadTask = this.buildCompiledTask(task, index);
    this.recordingIndex = index;
    this.statusMessage = `🔴 Recording active for task ${index + 1}. Click elements in the Chrome window.`;

    if (!task.clickSelectors) task.clickSelectors = [];

    this.automationService.streamJourney(payloadTask).subscribe({
      next: (newSelector) => {
        task.clickSelectors!.push(newSelector);
        task.clickSelectors = [...task.clickSelectors!]; 
      },
      error: (err) => {
        this.statusMessage = '❌ Failed to record journey.';
        this.recordingIndex = null;
      },
      complete: () => {
        this.statusMessage = '✅ Recording saved successfully!';
        this.recordingIndex = null;
        setTimeout(() => this.statusMessage = '', 4000);
      }
    });
  }

  // Apply compiler to Preview
  async previewTask(task: ScreenshotTask, index: number) {
    if (!task.url && !this.config.baseUrl) {
      alert("Please enter a URL first before previewing.");
      return;
    }

    const payloadTask = this.buildCompiledTask(task, index);
    this.previewingIndex = index;
    this.statusMessage = `👁️ Previewing task ${index + 1}. Watch the Chrome window to verify clicks.`;

    try {
      await firstValueFrom(this.automationService.previewJourney(payloadTask));
      this.statusMessage = '✅ Preview complete.';
    } catch (error) {
      this.statusMessage = '❌ Failed to launch preview.';
    } finally {
      this.previewingIndex = null;
      setTimeout(() => this.statusMessage = '', 4000);
    }
  }

  // Apply compiler to the Orchestrator
  async submitJob() {
    this.isExecuting = true;
    this.isPaused = false;
    this.isCancelled = false;
    this.completedTasks = 0;
    this.statusMessage = '';
    this.downloadUrl = null;

    // 🌟 NEW: Calculate the specific folder for this file
    const dynamicOutputDir = this.getDynamicOutputDir();

    this.executionStatus = '🧹 Cleaning previous files...';
    try {
      await firstValueFrom(this.automationService.cleanFolder(dynamicOutputDir));
    } catch (e) {
      console.warn("Could not clean folder, proceeding anyway.");
    }

    for (let i = 0; i < this.config.tasks.length; i++) {
      if (this.isCancelled) break;

      while (this.isPaused) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (this.isCancelled) break; 
      }
      
      if (this.isCancelled) break;

      const task = this.config.tasks[i];
      const payloadTask = this.buildCompiledTask(task, i); 
      
      this.executionStatus = `📸 Capturing: ${task.name}...`;

      try {
        await firstValueFrom(
          this.automationService.runSingleTask(payloadTask, dynamicOutputDir, this.config.globalWaitDelay)
        );
        this.completedTasks++;
      } catch (error) {
        console.error(`Task ${task.name} failed:`, error);
      }
    }

    if (this.isCancelled) {
      this.executionStatus = `⚠️ Automation Cancelled. ${this.completedTasks} images captured.`;
    } else {
      this.executionStatus = '📦 Zipping files together...';
      try {
        // 🌟 UPDATED: Capture the exact response from the backend!
        const zipResponse: any = await firstValueFrom(this.automationService.zipFolder(dynamicOutputDir));
        
        // Use the exact filename the server gave us (fallback to our guess if it's missing)
        const actualZipName = zipResponse.zipName || `${dynamicOutputDir}.zip`;
        
        this.executionStatus = `✅ Complete! Saved to /${actualZipName}`;
        
        // 🌟 UPDATED: Pass the exact file as a URL query parameter
        this.downloadUrl = `http://localhost:3000/api/download?file=${encodeURIComponent(actualZipName)}`;
        
      } catch (e) {
        this.executionStatus = '✅ Automation Complete! (Warning: Zip failed)';
      }
    }

    setTimeout(() => {
      this.isExecuting = false;
    }, 5000); 
  }

  // DELETE JSON 
  promptDelete(event: Event, filename: string) {
    event.stopPropagation();
    this.fileToDelete = filename;
  }

  async confirmDelete(event: Event) {
    event.stopPropagation();
    if (!this.fileToDelete) return;

    try {
      await firstValueFrom(this.automationService.deleteConfig(this.fileToDelete));
      this.statusMessage = `🗑️ Deleted ${this.fileToDelete}`;
      this.refreshRecents();
    } catch (error) {
      this.statusMessage = '❌ Failed to delete file.';
    } finally {
      this.fileToDelete = null;
      setTimeout(() => this.statusMessage = '', 3000);
    }
  }

  cancelDelete(event: Event) {
    event.stopPropagation();
    this.fileToDelete = null;
  }

  // =========================================================================
  // UI STATE MANAGERS (Keeps the data model clean!)
  // =========================================================================
  
  // 1. Tracks which accordions are open without saving it to the task object
  expandedTasks = new Set<ScreenshotTask>();

  toggleExpand(task: ScreenshotTask) {
    if (this.expandedTasks.has(task)) {
      this.expandedTasks.delete(task);
    } else {
      this.expandedTasks.add(task);
    }
  }

  // =========================================================================
  // DYNAMIC FOLDER GENERATOR
  // =========================================================================
  getDynamicOutputDir(): string {
    // 🌟 CLEANED: Only needs to strip .json now
    return this.currentFilename.replace(/\.json$/i, '');
  }
}