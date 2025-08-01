/* =========
  Squarespace Tabs Plugin
  A Tabs Plugin for Squarespace
  This Code is Licensed by Will-Myers.com
========== */

class wmTabs {
  static pluginTitle = "wmTabs";
  static isEditModeEventListenerSet = false;
  static defaultSettings = {
    tabImages: false,
    tabButtonTag: "h4",
    tabLimit: false,
    updateUrl: false,
    setInitialUrl: false,
    triggerEvent: "click",
    stickyNav: false,
    stickyNavThrottle: 100,
    stickyNavOffset: 17,
    scrollBackToTop: true,
    scrollBackOffset: 150,
    scrollBackBehavior: "auto",
    overflowIndicatorAction: "scroll",
    swipeThreshold: 50,
    dragStartThreshold: 10,
    slideTransitionDuration: 300,
    weglotPaths: [],
    allowClickAndDrag: false,
    edgeToEdge: false,
    allowTouchSwipe: false,
    accordionIcon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75 12 3m0 0 3.75 3.75M12 3v18" />
    </svg>`,
    overflowIndicatorStart: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="m11.25 9-3 3m0 0 3 3m-3-3h7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>`,
    overflowIndicatorEnd: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="m12.75 15 3-3m0 0-3-3m3 3h-7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>`,
    selectButtonIcon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
      <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>`,
    scrollTolerance: 3,
    scrollTabActivateTolerance: 50,
    centerActiveTab: false,
    breakpoints: {
      0: {
        navigationType: "select",
      },
      767: {
        navigationType: "horizontal",
      },
    },
    isSectionsAdjusted: false,
    hooks: {
      beforeInit: [],
      afterInit: [
        function () {
          wm$?.initializeAllPlugins();
        },
      ],
      beforeOpenTab: [],
      afterOpenTab: [],
    },
    disableAutoScroll: false,
    enableAutoScrollOnLoad: true,
  };
  static get userSettings() {
    return window[wmTabs.pluginTitle + "Settings"] || {};
  }
  constructor(el) {
    if (el.dataset.loadingState) {
      return;
    } else {
      el.dataset.loadingState = "loading";
    }
    this.el = el;
    this.source = el.dataset.source;
    if (this.el.parentElement.closest(`[data-wm-plugin="tabs"][data-source="${this.source}"]`)) {
      console.error("Recursive tabs plugin detected");
      return;
    }
    this.loadingState = "building";
    this.installationMethod;
    if (this.source) {
      this.installationMethod = "source";
    }
    if (this.el.querySelector("button")) {
      this.installationMethod = "sections";
    }
    this.settings = wm$.deepMerge({}, wmTabs.defaultSettings, wmTabs.userSettings, this.instanceSettings);
    this.items, this.type;
    this.tabs = [];
    this._navigaitonType = "";
    this.tweaks = Static.SQUARESPACE_CONTEXT.tweakJSON;
    this.hasAccordionInBreakpoints = Object.values(this.settings.breakpoints).some(breakpoint => breakpoint.navigationType === "accordion");
    this.hasSelectInBreakpoints = Object.values(this.settings.breakpoints).some(breakpoint => breakpoint.navigationType === "select");

    this.init();
  }
  async init() {
    this.runHooks("beforeInit");
    wm$.emitEvent(`${wmTabs.pluginTitle}:beforeInit`);
    this.el.dataset.navigationType = this.getNavigationType();
    this.buildStructure();
    if (this.source) {
      const {items, type} = await wm$.collectionData(this.source, {
        weglotPaths: this.settings.weglotPaths,
      });
      this.items = items;
      this.type = type;
      const tabLimit = typeof this.settings.tabLimit === "number" ? Math.min(this.settings.tabLimit, items.length) : items.length;
      this.tabs = items.slice(0, tabLimit).map(item => ({item}));

      this.injectHTML();
    } else {
      this.moveFromTargets();
      if (this.settings.isSectionsAdjusted) this.addEditModeObserver();
    }
    wm$.emitEvent(`${wmTabs.pluginTitle}:afterBuild`);

    // Edge To Edge
    if (this.settings.edgeToEdge) {
      this.el.classList.add("edge-to-edge");
      this.tabs.forEach(tab => {
        const sections = tab.panel.querySelectorAll("section.page-section[data-fluid-engine-section]");
        sections.forEach(section => {
          const fluidEngine = section.querySelector(".fluid-engine");
          const columnGap = getComputedStyle(fluidEngine).columnGap;
          fluidEngine.style.setProperty("--wm-column-gap", columnGap);
        });
      });
    }
    this.setStyles();
    this.setIsNavMaxWidth();
    this.bindEvents();
    this.handleTabsNavigationIndicatorsDisplay();
    //Open Initial Tab
    this.setNavWidth();
    this.activeTab = this.tabs[this.getInitialTabIndex()];
    this.openTab(this.activeTab.id);
    this.setActiveIndicator();
    this.removeGlobalAnimations();
    //Finalize Loading
    this.el.dataset.loadingState = "loaded";

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", async () => {
        await handleDOMReady.call(this);
      });
    } else {
      await handleDOMReady.call(this);
    }

    async function handleDOMReady() {
      const sections = document.querySelector("#sections");
      const lastSection = document.querySelector("#sections > section:last-child .content-wrapper");

      let originalParent = this.el.parentNode;
      let wasAppended = false;

      if (!sections?.contains(this.el)) {
        this.el.classList.add("moving-tabs-for-initialization");
        lastSection?.appendChild(this.el);
        wasAppended = true;
        await wm$?.reloadSquarespaceLifecycle([this.el]);
        window.dispatchEvent(new Event("resize"));
      } else {
        await wm$?.reloadSquarespaceLifecycle([this.el]);
      }

      try {
        if (typeof wm$.initializeCodeBlocks === "function") {
          await wm$.initializeCodeBlocks(this.el);
        }
        if (typeof wm$.initializeEmbedBlocks === "function") {
          await wm$.initializeEmbedBlocks(this.el);
        }
        if (typeof wm$.initializeThirdPartyPlugins === "function") {
          await wm$.initializeThirdPartyPlugins(this.el);
        }
        if (typeof wm$.handleAddingMissingColorTheme === "function") {
          await wm$.handleAddingMissingColorTheme();
        }
      } catch (error) {
        console.error("Error during initialization:", error);
      }

      if (wasAppended) {
        originalParent.appendChild(this.el);
        this.el.classList.remove("moving-tabs-for-initialization");
      }

      wm$?.emitEvent(`${wmTabs.pluginTitle}:ready`);
      this.loadingState = "complete";
    }

    this.setNavWidth();
    window.setTimeout(() => {
      this.openTab(this.activeTab.id);
      this.setActiveIndicator();
      this.setTabHeights();
      this.removeGlobalAnimations();
    }, 650);
    this.runHooks("afterInit");
  }
  bindEvents() {
    this.addTabClickEvent();
    this.addTabsResizeEvent();
    if (this.tabs[0].selectItem) this.addSelectEvents();
    this.addTabNavigationScrollEvent();
    this.addTabNavigationClickEvent();
    this.addStickyNavScrollEvent();
    this.addNextAndPrevTabButtonEvents();
    this.addClickAndDragSwipeEvent();
    this.addGlobalLinkClickListener();
    this.hasAccordionInBreakpoints ? this.addAccordionButtonClickEvent() : null;
    this.el.addEventListener("click", e => {
      if (!e.target.closest(".tab-panel")) return;

      const clickedLink = e.target.closest("a[href*='#']");
      if (clickedLink) {
        e.preventDefault();
        e.stopPropagation();
        this.handleAnchorLinkClickInTab(clickedLink);
        return; // Don't recalculate heights for anchor links
      }

      this.setTabHeights();
    });
  }
  buildStructure() {
    this.elements = {};
    this.el.classList.add("wm-tabs");
    this.el.dataset.overrideInitialGlobalAnimation = "true";

    this.initialInnerEl = document.createDocumentFragment();
    while (this.el.firstChild) {
      this.initialInnerEl.appendChild(this.el.firstChild);
    }

    const wrapper = document.createElement("div");
    wrapper.classList.add("tabs-wrapper");
    this.elements.wrapper = wrapper;

    const header = document.createElement("div");
    header.classList.add("tabs-header");
    this.elements.header = header;

    const nav = document.createElement("nav");
    nav.setAttribute("role", "tablist");
    this.elements.nav = nav;

    const navContainer = document.createElement("div");
    navContainer.classList.add("nav-container");
    this.elements.navContainer = navContainer;
    navContainer.appendChild(nav);

    const indicatorTrack = document.createElement("div");
    const activeIndicator = document.createElement("span");
    indicatorTrack.classList.add("indicator-track");
    activeIndicator.classList.add("active-indicator");
    indicatorTrack.appendChild(activeIndicator);
    this.elements.indicatorTrack = indicatorTrack;
    this.elements.activeIndicator = activeIndicator;
    this.elements.nav.appendChild(indicatorTrack);

    if (this.hasSelectInBreakpoints) {
      const selectNavigationContainer = document.createElement("div");
      selectNavigationContainer.classList.add("select-navigation-container");
      this.elements.selectNavigationContainer = selectNavigationContainer;

      const selectNavigation = document.createElement("div");
      selectNavigation.classList.add("select-navigation");
      this.elements.selectNavigation = selectNavigation;
      selectNavigationContainer.appendChild(selectNavigation);

      const selectButtonContainer = document.createElement("div");
      selectButtonContainer.classList.add("select-button-container");

      const selectButton = document.createElement("button");
      this.elements.selectButton = selectButton;

      const selectButtonText = document.createElement("span");
      selectButtonText.innerText = "Options";
      this.elements.selectButtonText = selectButtonText;

      const selectItemsContainer = document.createElement("div");
      selectItemsContainer.classList.add("select-items-container");

      const selectItemsWrapper = document.createElement("div");
      selectItemsWrapper.classList.add("select-items-wrapper");
      this.elements.selectItemsWrapper = selectItemsWrapper;

      selectNavigation.appendChild(selectButtonContainer);
      selectButtonContainer.appendChild(selectButton);
      selectButton.appendChild(selectButtonText);
      selectButton.insertAdjacentHTML("beforeend", this.settings.selectButtonIcon);
      selectItemsContainer.appendChild(selectItemsWrapper);
      selectNavigation.appendChild(selectItemsContainer);
      wrapper.appendChild(selectNavigationContainer);
    }

    const scrollIndicatorContainer = document.createElement("div");
    this.elements.scrollIndicatorContainer = scrollIndicatorContainer;
    scrollIndicatorContainer.classList = "scroll-indicator-container";
    const indicatorStart = document.createElement("button");
    this.elements.indicatorStart = indicatorStart;
    indicatorStart.classList = "scroll-indicator indicator-start";
    indicatorStart.innerHTML = this.settings.overflowIndicatorStart;
    const indicatorEnd = document.createElement("button");
    this.elements.indicatorEnd = indicatorEnd;
    indicatorEnd.classList = "scroll-indicator indicator-end";
    indicatorEnd.innerHTML = this.settings.overflowIndicatorEnd;
    scrollIndicatorContainer.appendChild(indicatorStart);
    scrollIndicatorContainer.appendChild(indicatorEnd);

    const content = document.createElement("div");
    content.classList.add("tabs-content");
    this.elements.tabsContent = content;

    const contentWrapper = document.createElement("div");
    contentWrapper.classList.add("tabs-content-wrapper");
    this.elements.tabsContentWrapper = contentWrapper;

    // Append elements
    header.append(scrollIndicatorContainer);
    header.appendChild(navContainer);
    wrapper.appendChild(header);
    wrapper.appendChild(content);
    content.appendChild(contentWrapper);

    // Clear the element and append the new structure
    this.el.innerHTML = "";
    this.el.dataset.navigationIndicators = "none";
    this.el.appendChild(wrapper);
  }
  injectHTML() {
    const contentFragment = document.createDocumentFragment();
    const tabButtonsFragment = document.createDocumentFragment();

    this.tabs.forEach(tab => {
      const item = tab.item;

      const tabPanel = document.createElement("article");
      tabPanel.classList.add("tab-panel");
      tabPanel.setAttribute("role", "tabpanel"); // ARIA role for tab panel
      tabPanel.setAttribute("aria-hidden", "true"); // Initially hidden
      const tabContent = document.createElement("div");
      tabContent.classList.add("tab-content");

      if (this.type === "portfolio") {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = item.body;
        const pageSectionsContainer = tempDiv.querySelector("#sections");
        while (pageSectionsContainer.firstChild) {
          tabContent.appendChild(pageSectionsContainer.firstChild);
        }
      } else {
        tabContent.innerHTML = item.body;
      }

      tabPanel.appendChild(tabContent);
      contentFragment.appendChild(tabPanel);
      tab.panel = tabPanel;
      tab.content = tabContent;

      const tabButton = document.createElement("button");
      tabButton.setAttribute("role", "tab"); // ARIA role for tab button
      tabButton.setAttribute("aria-controls", tabPanel.id);
      tabButton.setAttribute("aria-selected", "false"); // Not selected initially
      const title = item.title;
      tab.innerText = item.title;
      if (this.settings.tabImages) tabButton.innerHTML = `<div class="tab-button-image"><span class="img-spacer"></span><img src="${item.assetUrl}" width="150" height="150"/></div>`;
      tabButton.innerHTML += `<${this.settings.tabButtonTag} class="tab-title">${title}</${this.settings.tagButtonTag}>`;
      tabButtonsFragment.appendChild(tabButton);
      tab.button = tabButton;
      tab.id = this.getHashValueFromText(tab.innerText);
      tabButton.dataset.id = tab.id;

      if (this.hasAccordionInBreakpoints) {
        const accordionTabButton = tabButton.cloneNode(true);
        accordionTabButton.classList.add("accordion-dropdown");

        const accordionIcon = document.createElement("span");
        accordionIcon.classList.add("wm-icon");
        accordionIcon.innerHTML = this.settings.accordionIcon;
        accordionTabButton.appendChild(accordionIcon);

        tabPanel.prepend(accordionTabButton);
        tab.accordionButton = accordionTabButton;
      }
      if (this.hasSelectInBreakpoints) {
        const selectItem = document.createElement("button");
        selectItem.classList.add("select-item");
        selectItem.innerText = title;

        this.elements.selectItemsWrapper.append(selectItem);
        tab.selectItem = selectItem;
      }
    });

    this.elements.tabsContentWrapper.appendChild(contentFragment);
    this.elements.nav.appendChild(tabButtonsFragment);
    this.el.style.setProperty("--tabs-count", this.tabs.length);
  }
  moveFromTargets() {
    const contentFragment = document.createDocumentFragment();
    const tabButtonsFragment = document.createDocumentFragment();

    this.initialInnerEl.querySelectorAll("button").forEach(btn => {
      const tab = {};
      const tabButton = btn;

      const closestSection = this.el.closest(".page-section");
      if (!btn.dataset.target) {
        let nextSection = closestSection.nextElementSibling;

        // Loop to find the next valid page-section that is not a placeholder or reference element
        while (nextSection && (!nextSection.matches(".page-section") || nextSection.classList.contains("placeholder"))) {
          nextSection = nextSection.nextElementSibling;
        }

        // Only set the dataset.target if we find a valid nextSection
        if (nextSection) {
          btn.dataset.target = `section[data-section-id="${nextSection.dataset.sectionId}"].page-section`;
        } else {
          console.warn("No valid next section found for button:", btn);
        }
      }

      let sections;
      if (btn.dataset.target?.includes("/")) {
        sections = "";
      } else {
        this.settings.isSectionsAdjusted = true;
        sections = document.querySelectorAll(btn.dataset.target);
      }

      const tabPanel = document.createElement("article");
      tabPanel.classList.add("tab-panel");
      tabPanel.setAttribute("role", "tabpanel"); // ARIA role for tab panel
      tabPanel.setAttribute("aria-hidden", "true"); // Initially hidden
      const tabContent = document.createElement("div");
      tabContent.classList.add("tab-content");

      // Store original positions in a Map
      if (!wmTabs.originalPositions) {
        wmTabs.originalPositions = new Map();
      }

      // Create a placeholder for each section and move the section
      sections.forEach(section => {
        const placeholder = document.createElement("div");
        placeholder.classList.add("placeholder");

        // Insert placeholder before moving the section
        section.parentNode.insertBefore(placeholder, section);

        // Store the original parent and the placeholder
        wmTabs.originalPositions.set(section, {
          originalParent: section.parentNode,
          placeholder,
        });

        // Move the section to the new location
        tabContent.appendChild(section);
      });

      tabPanel.appendChild(tabContent);
      contentFragment.appendChild(tabPanel);
      tab.panel = tabPanel;
      tab.content = tabContent;

      tabButtonsFragment.appendChild(tabButton);
      tab.button = tabButton;
      tab.innerText = tabButton.innerText;
      tab.id = this.getHashValueFromText(tab.innerText);
      tabButton.dataset.id = tab.id;
      tabButton.setAttribute("role", "tab"); // ARIA role for tab button
      tabButton.setAttribute("aria-controls", tabPanel.id);
      tabButton.setAttribute("aria-selected", "false"); // Not selected initially
      const childNodes = Array.from(tabButton.childNodes);
      childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== "") {
          const span = document.createElement(this.settings.tabButtonTag);
          span.classList.add("tab-title");
          span.textContent = node.nodeValue;
          tabButton.replaceChild(span, node);
          tab.innerText = node.nodeValue;
        } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === "img") {
          const imageWrapper = document.createElement("div");
          imageWrapper.classList.add("tab-button-image");
          imageWrapper.append(node);
          tabButton.replaceChild(imageWrapper, node);
        }
      });

      if (this.hasAccordionInBreakpoints) {
        const accordionTabButton = tabButton.cloneNode(true);
        accordionTabButton.classList.add("accordion-dropdown");

        const accordionIcon = document.createElement("span");
        accordionIcon.classList.add("wm-icon");
        accordionIcon.innerHTML = this.settings.accordionIcon;
        accordionTabButton.appendChild(accordionIcon);

        tabPanel.prepend(accordionTabButton);
        tab.accordionButton = accordionTabButton;
      }
      if (this.hasSelectInBreakpoints) {
        const selectItem = document.createElement("button");
        selectItem.classList.add("select-item");
        selectItem.innerText = tab.innerText;

        this.elements.selectItemsWrapper.append(selectItem);
        tab.selectItem = selectItem;
      }

      this.tabs.push(tab);
    });
    this.elements.tabsContentWrapper.appendChild(contentFragment);
    this.elements.nav.appendChild(tabButtonsFragment);
    this.el.style.setProperty("--tabs-count", this.tabs.length);
  }
  addStickyNavScrollEvent() {
    if (this.settings.stickyNav) {
      this.elements.pageHeader = document.querySelector("#header");
      this.el.style.setProperty("--top-offset", this.settings.stickyNavOffset + "px");

      const onScroll = () => {
        const rect = this.el.getBoundingClientRect();

        if (this.tweaks["tweak-fixed-header"] === "true") {
          const headerBottom = this.elements.pageHeader?.getBoundingClientRect().bottom || 0;
          const offsetAmt = this.settings.stickyNavOffset + headerBottom;
          rect.top <= offsetAmt ? this.el.classList.add("is-sticky") : this.el.classList.remove("is-sticky");

          this.el.style.setProperty("--nav-sticky-offset", headerBottom + "px");
        } else {
          rect.top <= this.settings.stickyNavOffset ? this.el.classList.add("is-sticky") : this.el.classList.remove("is-sticky");
          this.el.style.setProperty("--nav-sticky-offset", "0px");
        }
      };

      let isScrolling = false;

      const onScrollWithAnimationFrame = () => {
        if (!isScrolling) {
          isScrolling = true;
          requestAnimationFrame(() => {
            onScroll();
            isScrolling = false;
          });
        }
      };

      window.addEventListener("scroll", onScrollWithAnimationFrame);

      // Initial call to set sticky state based on current scroll position
      onScroll();
    }
  }
  scrollBackToTop() {
    if (!this.settings.scrollBackToTop) return;
    const elRect = this.el.getBoundingClientRect();

    if (elRect.top <= -1) {
      const targetScrollY = window.scrollY + elRect.top - this.settings.scrollBackOffset;
      const behavior = this.settings.scrollBackBehavior === "smooth" ? "smooth" : "auto";

      window.scrollTo({
        top: targetScrollY,
        behavior: behavior,
      });
    }
  }
  getHashValueFromText(text) {
    // Function to normalize accented characters
    const normalizeText = str => {
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    };

    // Normalize the text first
    const normalizedText = normalizeText(text);

    // Then apply the filtering
    const filteredText = normalizedText.replace(/[^a-zA-Z0-9_-]/g, "-");
    let encodedText = encodeURIComponent(filteredText.trim().toLowerCase());
    let num = 0;
    let newText = encodedText;

    // Check if there is a button with the same data-id, append a number if found
    while (document.querySelector(`button[data-id="${newText}"]`)) {
      num++;
      newText = `${encodedText}-${num}`;
    }

    return newText;
  }
  getInitialTabIndex() {
    function hashedValueForUrl(text) {
      const filteredText = text.replace(/[^a-zA-Z0-9_-]/g, "-");
      const encodedText = encodeURIComponent(filteredText.trim().toLowerCase());
      return "#" + encodedText;
    }

    const matchingTabIndex = this.tabs.findIndex(tab => window.location.hash === hashedValueForUrl(tab.innerText));

    let matchingTab;
    if (matchingTabIndex !== -1) {
      matchingTab = matchingTabIndex;
      const elRect = this.el.getBoundingClientRect();
      const targetScrollY = window.scrollY + elRect.top - this.settings.scrollBackOffset;
      const behavior = "smooth";

      if (this.settings.enableAutoScrollOnLoad) {
      window.scrollTo({
          top: targetScrollY,
          behavior: behavior,
        });
      }
    } else {
      matchingTab = 0;
    }

    return matchingTab;
  }
  addTabClickEvent() {
    const handleClickEvent = activeTab => {
      const id = activeTab.id;
      this.openTab(id);
    };

    this.tabs.forEach(tab => {
      tab.button.addEventListener("click", () => {
        handleClickEvent(tab);
      });

      tab.button.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleClickEvent(tab);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          this.focusNextTab();
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          this.focusPreviousTab();
        } else if (event.key === "Tab") {
          if (!event.shiftKey) {
            event.preventDefault();
            this.focusFirstTabbableElementOrNextTab(tab);
          }
        }
      });

      if (this.settings.triggerEvent === "hover") {
        tab.button.addEventListener("mouseenter", () => {
          handleClickEvent(tab);
        });
      }
    });
  }
  setActiveIndicator() {
    const btn = this.activeTab.button;
    const width = btn.offsetWidth;
    const height = btn.offsetHeight - 1;
    const left = btn.offsetLeft;
    const top = btn.offsetTop + 0.5;

    const navPaddingInline = window.getComputedStyle(this.elements.nav).paddingInlineStart;
    const navPaddingBlock = window.getComputedStyle(this.elements.nav).paddingBlockStart;

    this.el.style.setProperty("--tab-button-active-width", width + "px");
    this.el.style.setProperty("--tab-button-active-left", left - parseInt(navPaddingInline) + "px");
    this.el.style.setProperty("--tab-button-active-top", top - parseInt(navPaddingBlock) + "px");
    this.el.style.setProperty("--tab-button-active-height", height + "px");
  }
  addSelectEvents() {
    const handleItemClick = activeTab => {
      const id = activeTab.id;
      this.openTab(id);
    };
    const toggleMenu = e => {
      this.elements.selectNavigation.classList.toggle("open");
    };

    this.tabs.forEach(tab => {
      tab.selectItem.addEventListener("click", () => {
        handleItemClick(tab);
      });
    });

    this.elements.selectNavigation.addEventListener("click", toggleMenu);
  }
  addTabNavigationScrollEvent() {
    const handleScroll = () => {
      this.handleTabsNavigationIndicatorsDisplay();
    };
    const throttledHandleScroll = wm$.throttle(handleScroll, 250);
    this.elements.nav.addEventListener("scroll", throttledHandleScroll);
  }
  addTabNavigationClickEvent() {
    this.elements.indicatorStart.addEventListener("click", () => {
      this.settings.overflowIndicatorAction === "move" ? this.prevTab() : this.moveTabsNavigation(-50);
    });
    this.elements.indicatorEnd.addEventListener("click", () => {
      this.settings.overflowIndicatorAction === "move" ? this.nextTab() : this.moveTabsNavigation(50);
    });
  }
  handleTabsNavigationIndicatorsDisplay() {
    const nav = this.elements.nav;
    let indicatorLabel = "none";

    if (this.navigationType === "horizontal") {
      const scrollWidth = nav.scrollWidth - this.settings.scrollTolerance;
      const navWidth = nav.clientWidth;
      const leftPos = nav.scrollLeft - this.settings.scrollTolerance;
      const rightPos = leftPos + navWidth + this.settings.scrollTolerance;

      if (scrollWidth > navWidth) {
        if (leftPos > 0) indicatorLabel = "start";
        if (rightPos < scrollWidth) indicatorLabel = "end";
        if (leftPos > 0 && rightPos < scrollWidth) indicatorLabel = "both";
      } else if (scrollWidth <= navWidth) {
        indicatorLabel = "none";
      }
    }

    if (this.navigationType === "vertical") {
      const scrollHeight = nav.scrollHeight - this.settings.scrollTolerance;
      const navHeight = nav.clientHeight;
      const topPos = nav.scrollTop - this.settings.scrollTolerance;
      const bottomPos = topPos + navHeight + this.settings.scrollTolerance;

      if (scrollHeight > navHeight) {
        if (topPos > 0) indicatorLabel = "start";
        if (bottomPos < scrollHeight) indicatorLabel = "end";
        if (topPos > 0 && bottomPos < scrollHeight) indicatorLabel = "both";
      } else if (scrollHeight <= navHeight) {
        indicatorLabel = "none";
      }
    }

    this.el.dataset.navigationIndicators = indicatorLabel;
  }
  moveTabsNavigation(amt) {
    if (this.navigationType === "horizontal") {
      const currentScrollLeft = this.elements.nav.scrollLeft;
      const scrollAmount = this.elements.nav.clientWidth * (amt / 100);
      const newScrollLeft = currentScrollLeft + scrollAmount;

      this.elements.nav.scrollTo({
        left: newScrollLeft,
        behavior: "smooth",
      });
    } else if (this.navigationType === "vertical") {
      const currentScrollTop = this.elements.nav.scrollTop;
      const scrollAmount = this.elements.nav.clientHeight * (amt / 100);
      const newScrollTop = currentScrollTop + scrollAmount;
      this.elements.nav.scrollTo({
        top: newScrollTop,
        behavior: "smooth",
      });
    }
  }
  scrollTabIntoView() {
    // Add a new setting to control auto-scrolling
    if (this.settings.disableAutoScroll) return;

    const tolerance = this.settings.scrollTabActivateTolerance;
    const nav = this.elements.nav;
    const activeTabButton = this.activeTab.button;

    if (this.navigationType === "horizontal") {
      const activeLeft = activeTabButton.offsetLeft;
      const activeWidth = activeTabButton.clientWidth;
      const activeRight = activeLeft + activeWidth;

      const navBarLeft = nav.scrollLeft;
      const navBarWidth = nav.clientWidth;
      const navBarRight = navBarLeft + navBarWidth;

      if (this.settings.centerActiveTab) {
        const activeMidPoint = activeLeft + activeWidth / 2;
        const navMidPoint = navBarLeft + navBarWidth / 2;

        const moveDistance = activeMidPoint - navMidPoint;
        const movePercentage = (moveDistance / navBarWidth) * 100;

        this.moveTabsNavigation(movePercentage);
      } else {
        if (navBarLeft >= activeLeft - tolerance) {
          this.moveTabsNavigation(-35);
        } else if (navBarRight <= activeRight + tolerance) {
          this.moveTabsNavigation(35);
        }
      }
    } else if (this.navigationType === "vertical") {
      const activeTop = activeTabButton.offsetTop;
      const activeHeight = activeTabButton.clientHeight;
      const activeBottom = activeTop + activeHeight;

      const navBarTop = nav.scrollTop;
      const navBarHeight = nav.clientHeight;
      const navBarBottom = navBarTop + navBarHeight;

      if (this.settings.centerActiveTab) {
        const activeMidPoint = activeTop + activeHeight / 2;
        const navMidPoint = navBarTop + navBarHeight / 2;

        const moveDistance = activeMidPoint - navMidPoint;
        const movePercentage = (moveDistance / navBarHeight) * 100;

        this.moveTabsNavigation(movePercentage);
      } else {
        if (navBarTop >= activeTop - tolerance) {
          this.moveTabsNavigation(-35);
        } else if (navBarBottom <= activeBottom + tolerance) {
          this.moveTabsNavigation(35);
        }
      }
    }
  }
  addAccordionButtonClickEvent() {
    const handleClickEvent = activeTab => {
      this.activeTab = activeTab;
      this.tabs.forEach(tab => {
        if (tab === activeTab) {
          tab.accordionButton.classList.add("active");
          tab.button.classList.add("active");
          tab.panel.classList.add("active");
          tab.panel.style.transform = "translateX(0px)";
          tab.content.style.height = tab.content.scrollHeight + "px";
          tab.content.style.maxHeight = "";
        } else {
          tab.active = false;
          tab.accordionButton.classList.remove("active");
          tab.button.classList.remove("active");
          tab.panel.classList.remove("active");
          tab.content.style.height = "0px";
          tab.content.style.maxHeight = "0px";
        }
      });
      this.setTabHeights();
    };

    this.tabs.forEach(tab => {
      tab.accordionButton.addEventListener("click", () => {
        handleClickEvent(tab);
      });
    });
  }
  addTabsResizeEvent() {
    const handleResize = () => {
      this.tabsOffset = this.activeTab.panel.offsetLeft;
      this.navigationType = this.getNavigationType();
      this.setNavWidth();
      this.setIsNavMaxWidth();
      this.setActiveIndicator();
      this.setTabHeights();
      this.scrollTabIntoView();
      this.handleTabsNavigationIndicatorsDisplay();
    };
    const throttledResize = wm$.throttle(handleResize, 250);
    window.addEventListener("resize", throttledResize);
  }
  addClickAndDragSwipeEvent() {
    const tabsContentWrapper = this.elements.tabsContentWrapper;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let currentTranslate = 0;
    let initialTranslate = 0;
    let animationID;
    let isHorizontalSwipe = false; // To track if the swipe is horizontal
    const transitionDuration = this.settings.slideTransitionDuration;
    const dragThreshold = this.settings.dragStartThreshold; // Threshold in pixels to start the drag movement

    // Function to set the transform style
    function setTranslateX(translate) {
      tabsContentWrapper.style.transform = `translateX(${translate}px)`;
    }

    // Touch and Mouse Down event handler
    function startSwipe(event) {
      if (event.target.closest("img, button, a") && event.type.includes("mouse")) return;
      if (event.target.closest("a, button") && event.type.includes("touch")) return;
      isDragging = true;
      startX = getPositionX(event);
      startY = getPositionY(event);
      initialTranslate = -1 * this.tabsOffset;
      currentTranslate = initialTranslate;
      tabsContentWrapper.classList.add("dragging");
      isHorizontalSwipe = false; // Reset swipe direction detection
    }

    // Touch and Mouse Move event handler
    function swiping(event) {
      if (isDragging) {
        const currentX = getPositionX(event);
        const currentY = getPositionY(event);
        const deltaX = currentX - startX;
        const deltaY = currentY - startY;

        // Check if the movement exceeds the drag threshold
        if (!isHorizontalSwipe && Math.abs(deltaX) < dragThreshold) {
          // If not, do not start dragging
          return;
        }

        // Determine if the swipe is horizontal or vertical
        if (!isHorizontalSwipe) {
          isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);
          if (!isHorizontalSwipe) {
            // If it's determined to be a vertical swipe, stop further processing
            isDragging = false;
            tabsContentWrapper.classList.remove("dragging");
            return;
          }
        }

        event.preventDefault();

        currentTranslate = initialTranslate + deltaX;
        setTranslateX(currentTranslate);
      }
    }

    // Touch and Mouse Up event handler
    function endSwipe() {
      if (!isDragging) return;
      cancelAnimationFrame(animationID);
      isDragging = false;
      const movedBy = currentTranslate - initialTranslate;
      const swipeThreshold = this.settings.swipeThreshold || 20;

      if (movedBy < -swipeThreshold) {
        tabsContentWrapper.style.transition = `transform ${transitionDuration}ms ease`;
        if (this.activeTab !== this.tabs[this.tabs.length - 1]) {
          this.nextTab();
        } else {
          currentTranslate = initialTranslate;
          setTranslateX(currentTranslate);
        }
        window.setTimeout(() => {
          tabsContentWrapper.style.transition = "";
          tabsContentWrapper.classList.remove("dragging");
        }, transitionDuration);
      } else if (movedBy > swipeThreshold) {
        tabsContentWrapper.style.transition = `transform ${transitionDuration}ms ease`;
        if (this.activeTab !== this.tabs[0]) {
          this.prevTab();
        } else {
          currentTranslate = initialTranslate;
          setTranslateX(currentTranslate);
        }
        window.setTimeout(() => {
          tabsContentWrapper.style.transition = "";
          tabsContentWrapper.classList.remove("dragging");
        }, transitionDuration);
      } else {
        tabsContentWrapper.style.transition = `transform ${transitionDuration}ms ease`;
        currentTranslate = initialTranslate;
        setTranslateX(currentTranslate);
        window.setTimeout(() => {
          tabsContentWrapper.style.transition = "";
          tabsContentWrapper.classList.remove("dragging");
        }, transitionDuration);
      }
      //tabsContentWrapper.classList.remove("dragging");
    }

    // Helper function to get the X position of touch or mouse event
    function getPositionX(event) {
      return event.type.includes("mouse") ? event.pageX : event.touches[0].clientX;
    }

    // Helper function to get the Y position of touch or mouse event
    function getPositionY(event) {
      return event.type.includes("mouse") ? event.pageY : event.touches[0].clientY;
    }

    // Animation function to smoothly update the position
    function animation() {
      if (isDragging) {
        setTranslateX(currentTranslate);
        requestAnimationFrame(animation);
      }
    }

    // Add event listeners for touch and mouse events
    if (this.settings.allowTouchSwipe) {
      tabsContentWrapper.addEventListener("touchstart", startSwipe.bind(this));
      tabsContentWrapper.addEventListener("touchmove", swiping.bind(this));
      tabsContentWrapper.addEventListener("touchend", endSwipe.bind(this));
    }

    if (this.settings.allowClickAndDrag) {
      tabsContentWrapper.addEventListener("mousedown", startSwipe.bind(this));
      tabsContentWrapper.addEventListener("mousemove", swiping.bind(this));
      tabsContentWrapper.addEventListener("mouseup", endSwipe.bind(this));
      tabsContentWrapper.addEventListener("mouseleave", endSwipe.bind(this));
    }
  }
  getNavigationType() {
    const {breakpoints} = this.settings;
    const width = window.innerWidth;
    let navigationType = breakpoints[0].navigationType; // Default to the smallest breakpoint
    for (const breakpoint in breakpoints) {
      if (width >= breakpoint) {
        navigationType = breakpoints[breakpoint].navigationType;
      }
    }
    this.navigationType = navigationType;

    return navigationType;
  }
  setNavigationType(value) {
    this.el.dataset.navigationType = value;
    if (this.loadingState !== "complete") return;
    if (value === "accordion") {
      this.tabs.forEach(tab => (tab.panel.style.transform = "initial"));
      this.elements.tabsContentWrapper.style.height = "";
      this.elements.tabsContentWrapper.style.transform = "";
    }
    if (value === "tab") {
      this.tabs.forEach(tab => {
        tab.content.style.height = "";
        tab.content.style.maxHeight = "";
      });
    }
  }
  setTabHeights() {
    const setHeight = () => {
      this.elements.tabsContentWrapper.style.height = this.activeTab.content.clientHeight + "px";
      if (this.el.parentElement.closest('[data-wm-plugin="tabs"]')) {
        this.el.parentElement.closest('[data-wm-plugin="tabs"]')?.wmTabs?.setTabHeights();
      }
    };
    if (this.navigationType === "horizontal" || this.navigationType === "vertical" || this.navigationType === "select") {
      setHeight();

      window.setTimeout(() => {
        setHeight();
      }, 650);
    }
  }
  setStyles() {
    const section = this.el.closest("section.page-section");
    const computedStyle = getComputedStyle(section);
    const colorMap = {
      "--wm-accent-hsl": "--primaryButtonBackgroundColor",
      "--wm-accent-inverse-hsl": "--primaryButtonTextColor",
      "--wm-background-hsl": "--siteBackgroundColor",
      "--wm-text-hsl": "--paragraphMediumColor",
    };

    // Function to extract HSL values from HSLA string
    const extractHSLValues = hslaValue => {
      const match = hslaValue.match(/hsla?\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%/);
      return match ? `${match[1]},${match[2]}%,${match[3]}%` : "";
    };

    for (const [key, value] of Object.entries(colorMap)) {
      const sectionColorValue = computedStyle.getPropertyValue(value);
      const hslValues = extractHSLValues(sectionColorValue);
      this.el.style.setProperty(key, hslValues);
    }
  }
  setUrlHash(value) {
    location.hash = value;
  }
  setNavWidth() {
    this.elements.nav.style.setProperty("--nav-scroll-width", "0px");
    this.elements.nav.style.setProperty("--nav-scroll-height", "0px");
    this.elements.nav.style.setProperty("--nav-full-width", "0px");
    this.elements.nav.style.setProperty("--nav-full-height", "0px");

    requestAnimationFrame(() => {
      this.navWidth = this.elements.nav.offsetWidth - 1;
      this.navHeight = this.elements.nav.offsetHeight - 1;
      this.navFullWidth = this.elements.nav.scrollWidth - 1;
      this.navFullHeight = this.elements.nav.scrollHeight - 1;
    });
  }
  setIsNavMaxWidth() {
    function isFullWidth(element) {
      const rect = element.getBoundingClientRect();
      const windowWidth = window.innerWidth || document.documentElement.clientWidth;
      const tolerance = 3;
      return Math.abs(rect.width - windowWidth) <= tolerance;
    }
    isFullWidth(this.el) ? this.el.classList.add("full-width") : this.el.classList.remove("full-width");
  }
  addNextAndPrevTabButtonEvents() {
    const handleNextClick = e => {
      e.preventDefault();
      e.stopPropagation();
      this.nextTab();
    };

    const handlePrevClick = e => {
      e.preventDefault();
      e.stopPropagation();
      this.prevTab();
    };

    this.el.querySelectorAll('a[href="#next_tab"]').forEach(btn => {
      btn.setAttribute("href", "javascript:void(0)");
      btn.addEventListener("click", handleNextClick, {once: true});
      btn.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          handleNextClick(event);
          this.activeTab.button.focus();
        }
      });
    });

    this.el.querySelectorAll('a[href="#prev_tab"]').forEach(btn => {
      btn.setAttribute("href", "javascript:void(0)");
      btn.addEventListener("click", handlePrevClick, {once: true});
      btn.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          handlePrevClick(event);
          this.activeTab.button.focus();
        }
      });
    });
  }
  pauseAllVideos() {
    const videos = this.el.querySelectorAll(".sqs-block-video");
    videos.forEach(vid => {
      if (vid.$wmPause && vid.querySelector("video")?.volume > 0 && !vid.querySelector("video")?.muted) {
        vid.$wmPause();
      }
    });
  }
  nextTab() {
    const currentIndex = this.tabs.findIndex(tab => tab.id === this.activeTab.id);
    const nextIndex = (currentIndex + 1) % this.tabs.length;
    this.openTab(this.tabs[nextIndex].id);
  }
  prevTab() {
    const currentIndex = this.tabs.findIndex(tab => tab.id === this.activeTab.id);
    const prevIndex = (currentIndex - 1 + this.tabs.length) % this.tabs.length;
    this.openTab(this.tabs[prevIndex].id);
  }
  openTab(tabId) {
    // Safety check to ensure the instance is fully initialized
    if (!this.settings || !this.tabs || this.tabs.length === 0) {
      console.warn("wmTabs instance not fully initialized. Cannot open tab:", tabId);
      return;
    }

    this.runHooks("beforeOpenTab", tabId);
    wm$?.emitEvent(`${wmTabs.pluginTitle}:beforeOpenTab`, {
      tabId: tabId,
      instance: this,
    });

    const activeTab = this.tabs.filter(tab => tab.id === tabId)[0];
    if (!activeTab) console.debug("No Tab!");
    this.activeTab = activeTab;
    this.tabs.forEach(tab => {
      if (tab === activeTab) {
        tab.button?.classList.add("active");
        tab.button?.setAttribute("aria-selected", "true");
        tab.panel.setAttribute("aria-hidden", "false");
        tab.panel.classList.add("active");
        tab.selectItem?.classList.add("active");
        if (this.elements.selectButtonText) this.elements.selectButtonText.innerText = tab.innerText;
        this.setTabHeights();
      } else {
        tab.active = false;
        tab.button?.classList.remove("active");
        tab.button?.setAttribute("aria-selected", "false");
        tab.panel.setAttribute("aria-hidden", "true");
        tab.panel.classList.remove("active");
        tab.selectItem?.classList.remove("active");
      }
    });

    // Store the URL update decision before modifying setInitialUrl
    const shouldUpdateUrl = this.settings.updateUrl && this.settings.setInitialUrl;

    // Handle all positioning and layout first
    this.settings.setInitialUrl = true;
    this.pauseAllVideos();
    this.scrollTabIntoView();
    this.scrollBackToTop();
    this.setActiveIndicator();
    this.tabsOffset = this.activeTab.panel.offsetLeft;

    // Update URL hash after all positioning is complete to avoid layout interference
    if (shouldUpdateUrl) {
      requestAnimationFrame(() => {
        this.setUrlHash(this.activeTab.id);
      });
    }

    this.activeTab.panel.focus();
    wm$?.emitEvent(`${wmTabs.pluginTitle}:afterOpenTab`, {
      tabId: tabId,
      instance: this,
    });
    this.runHooks("afterOpenTab", tabId);
  }
  focusNextTab() {
    const focusedIndex = this.getFocusedTabIndex();
    if (focusedIndex !== -1) {
      const nextIndex = (focusedIndex + 1) % this.tabs.length;
      this.tabs[nextIndex].button.focus();
    }
  }
  focusPreviousTab() {
    const focusedIndex = this.getFocusedTabIndex();
    if (focusedIndex !== -1) {
      const prevIndex = (focusedIndex - 1 + this.tabs.length) % this.tabs.length;
      this.tabs[prevIndex].button.focus();
    }
  }
  getFocusedTabIndex() {
    return this.tabs.findIndex(tab => tab.button === document.activeElement);
  }
  focusFirstTabbableElementOrNextTab(tab) {
    const panel = tab.panel;
    const index = this.tabs.findIndex(t => t === tab);
    const tabbableSelector = 'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])';
    const tabbableElements = panel.querySelectorAll(tabbableSelector);

    if (tabbableElements.length > 0) {
      tabbableElements[0].focus();
    } else {
      this.focusNextTabFromIndex(index);
    }
  }
  focusNextTabFromIndex(currentIndex) {
    const nextIndex = (currentIndex + 1) % this.tabs.length;
    this.tabs[nextIndex].button.focus();
  }
  removeGlobalAnimations() {
    // Select all elements with any of the specified classes
    let els = this.el.querySelectorAll(".slideIn, .fadeIn, .scaleIn, .flexIn, .preFade, .preScale, .preFlex, .preSlide");
    els = this.el.querySelectorAll(".tabs-header .tab-title");

    // List of classes to remove
    const classesToRemove = ["slideIn", "fadeIn", "scaleIn", "flexIn", "preFade", "preScale", "preFlex", "preSlide"];

    // Iterate over each selected element and remove the specified classes
    els.forEach(el => {
      el.setAttribute("data-override-initial-global-animation", "");
      el.removeAttribute("data-animation-role");
      el.classList.remove(...classesToRemove);
      el.style.transitionTimingFunction = "";
      el.style.transitionDelay = "";
      el.style.transitionDuration = "";
    });
  }
  addEditModeObserver() {
    const isBackend = window.self !== window.top;
    if (wmTabs.isEditModeEventListenerSet || !isBackend) return;

    let deconstructed = false;

    // Observe changes to the body's class attribute
    const bodyObserver = new MutationObserver(async mutations => {
      for (const mutation of mutations) {
        if (mutation.attributeName === "class") {
          const classList = document.body.classList;
          if (classList.contains("sqs-edit-mode-active")) {
            if (!deconstructed && wmTabs.originalPositions) {
              deconstructed = true;
              wmTabs.originalPositions.forEach((info, section) => {
                section.remove();
              });
              wmTabs.originalPositions.clear();
              try {
                await wm$.reloadSquarespaceLifecycle();
              } catch (error) {
                console.error("Error reloading Squarespace lifecycle:", error);
              }
              bodyObserver.disconnect();
            }
          }
        }
      }
    });

    bodyObserver.observe(document.body, {
      attributes: true,
    });

    wmTabs.isEditModeEventListenerSet = true;
  }
  runHooks(hookName, ...args) {
    // Safety check to handle cases where settings might be undefined
    if (!this.settings || !this.settings.hooks) {
      return;
    }
    const hooks = this.settings.hooks[hookName] || [];
    hooks.forEach(callback => {
      if (typeof callback === "function") {
        callback.apply(this, args);
      }
    });
  }
  handleAnchorLinkClickInTab(clickedLink) {
    // Handle anchor link navigation within the tab
    const href = clickedLink.getAttribute("href");
    if (href && href.startsWith("#")) {
      const targetId = href.substring(1);
      const targetElement = this.activeTab.panel.querySelector(`#${targetId}, [name="${targetId}"]`);

      if (targetElement) {
        // Get the absolute position of the target element relative to the page
        const targetRect = targetElement.getBoundingClientRect();
        const scrollTop = window.scrollY + targetRect.top;

        // Scroll the window to the target element
        window.scrollTo({
          top: scrollTop,
          behavior: "smooth",
        });
      }
    }
  }
  get contentHeight() {
    return this._contentHeight;
  }
  set contentHeight(value) {
    this._contentHeight = value;
  }
  get navigationType() {
    return this._navigationType;
  }
  set navigationType(value) {
    this._navigationType = value;
    this.setNavigationType(value);
  }
  get activeTab() {
    return this.tabs.filter(tab => tab.active)[0];
  }
  set activeTab(activeTab) {
    this.tabs.forEach(tab => {
      if (activeTab === tab) {
        tab.active = true;
      } else {
        tab.active = false;
      }
    });
  }
  get instanceSettings() {
    const dataAttributes = {};

    if (this.el.dataset.desktopNavigationType) {
      this.el.dataset.breakpoints__767__navigationType = this.el.dataset.desktopNavigationType;
    }
    if (this.el.dataset.mobileNavigationType) {
      this.el.dataset.breakpoints__0__navigationType = this.el.dataset.mobileNavigationType;
    }

    // Function to set value in a nested object based on key path
    const setNestedProperty = (obj, keyPath, value) => {
      const keys = keyPath.split("__");
      let current = obj;

      keys.forEach((key, index) => {
        if (index === keys.length - 1) {
          current[key] = wm$.parseAttr(value);
        } else {
          current = current[key] = current[key] || {};
        }
      });
    };

    for (let [attrName, value] of Object.entries(this.el.dataset)) {
      setNestedProperty(dataAttributes, attrName, value);
    }
    return dataAttributes;
  }
  get tabsOffset() {
    return this._overflowTabsOffset;
  }
  set tabsOffset(offset) {
    requestAnimationFrame(() => {
      this._overflowTabsOffset = offset;
      this.elements.tabsContentWrapper.style.transform = `translateX(${offset * -1}px)`;
    });
  }
  get loadingState() {
    return this._loadingState;
  }
  set loadingState(value) {
    this._loadingState = value;
  }
  get navWidth() {
    return this._navWidth;
  }
  set navWidth(width) {
    this._navWidth = width;
    this.elements.nav.style.setProperty("--nav-scroll-width", this._navWidth + "px");
  }
  get navFullWidth() {
    return this._navFullWidth;
  }
  set navFullWidth(width) {
    this._navFullWidth = width;
    this.elements.nav.style.setProperty("--nav-full-width", this._navFullWidth + "px");
  }
  get navFullHeight() {
    return this._navFullHeight;
  }
  set navFullHeight(height) {
    this._navFullHeight = height;
    this.elements.nav.style.setProperty("--nav-full-height", this._navFullHeight + "px");
  }
  get navHeight() {
    return this._navHeight;
  }
  set navHeight(height) {
    this._navHeight = height;
    this.elements.nav.style.setProperty("--nav-scroll-height", this._navHeight + "px");
  }
  addGlobalLinkClickListener() {
    document.addEventListener("click", event => {
      const clickedElement = event.target.closest("a");
      if (!clickedElement) return;

      const href = clickedElement.getAttribute("href");
      if (!href) return;

      // Create URL objects for comparison
      const linkUrl = new URL(href, window.location.href);
      const currentUrl = new URL(window.location.href);

      // Check if pathnames match and there's a hash
      if (linkUrl.pathname === currentUrl.pathname && linkUrl.hash) {
        const tabId = linkUrl.hash.substring(1);
        const matchingTab = this.tabs.find(tab => tab.id === tabId);

        if (matchingTab) {
          event.preventDefault();
          this.scrollToTabsAndOpen(tabId);
        }
      }
    });
  }
  scrollToTabsAndOpen(tabId) {
    this.el.scrollIntoView({behavior: "smooth", block: "start"});

    // Wait for the scroll to complete before opening the tab
    setTimeout(() => {
      this.openTab(tabId);
    }, 500); // Adjust this delay if needed
  }
}

(() => {
  function initTabs() {
    const els = document.querySelectorAll('[data-wm-plugin="tabs"]');
    if (!els.length) return;
    els.forEach(el => {
      const instance = new wmTabs(el);
      // Only assign the instance if it was properly initialized
      if (instance.settings && instance.tabs !== undefined) {
        el.wmTabs = instance;
      }
    });
  }
  window.wmTabs = {
    init: () => initTabs(),
  };
  window.wmTabs.init();
})();
