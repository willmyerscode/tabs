class WMTabs {
  static emitEvent(type, detail = {}, elem = document) {
    // Make sure there's an event type
    if (!type) return;

    // Create a new event
    let event = new CustomEvent(type, {
      bubbles: true,
      cancelable: true,
      detail: detail,
    });

    // Dispatch the event
    return elem.dispatchEvent(event);
  };

  static settings = {
    scrollIcons: {
      left: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>`,
      right: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>`,
    },
  };
  constructor(el, settings = {}) {
    this.el = el;
    this.settings = settings;
    this.tabs = [];
    this.scrollLeft = this.el.querySelector("header > .scroll-left");
    this.scrollRight = this.el.querySelector("header > .scroll-right");
    this.indicator = this.el.querySelector("nav .indicator");
    this.indicatorTrack = this.el.querySelector("nav .indicator-track");
    this.nav = this.el.querySelector("nav");
    this.tabsWrapper = this.el.querySelector('section.tabs-wrapper')
    this.runScripts = true;
    this.on = {
      loaded: () => {
        this.runSQSSiteBundle()
        this.checkNavScrollPosition()
      },
      tabChange: () => {
        window.dispatchEvent(new Event('resize'))
      }
    }

    this.activeTab = null;
    this.init();
  }

  init() {
    this.setTabItems();
    this.addScrollIcons();
    this.setTabClickEventListener();
    this.setScrollIconClickListener();
    this.setNavScrollEventListener();
    this.openTab(0);
    this.addResizeEventListener();

    window.dispatchEvent(new Event(''))

    WMTabs.emitEvent('Tabs Loaded', {id: this.el.closest('.sqs-block').id, target: this.el})
    this.on.loaded();
  }

  setTabItems() {
    const buttons = this.el.querySelectorAll("button[data-id]");

    buttons.forEach(button => {
      const tabId = button.getAttribute("data-id");
      const article = this.el.querySelector(`article[data-id="${tabId}"]`);
      this.tabs.push({button, article});
    });
  }

  addScrollIcons() {
    this.scrollLeft.innerHTML = WMTabs.settings.scrollIcons.left;
    this.scrollRight.innerHTML = WMTabs.settings.scrollIcons.right;
  }

  openTab(index) {
    this.activeTab = this.tabs[index];

    this.tabs.forEach(tab => {
      if (tab === this.activeTab) {
        tab.button.classList.add("active");
        tab.article.classList.add("active");
        this.tabsWrapper.scrollLeft = tab.article.offsetLeft;
        this.tabsWrapper.style.height = tab.article.clientHeight + 'px'
      } else {
        tab.button.classList.remove("active");
        tab.article.classList.remove("active");
      }
    });
    this.scrollTabIntoView(index);
    this.on.tabChange();
  }

  scrollTabIntoView(index) {
    const padding = this.nav.clientWidth / 4;
    const activeButton = this.tabs[index].button;
    const buttonRightEdge = activeButton.offsetLeft + activeButton.clientWidth;
    const buttonLeftEdge = activeButton.offsetLeft;
    const navScrollLeft = this.nav.scrollLeft;
    const navRightEdge = this.nav.clientWidth + navScrollLeft;
    if ((buttonRightEdge + padding) > navRightEdge) {
      const difference = buttonRightEdge - navRightEdge + padding;
      this.nav.scrollTo({
        left: navScrollLeft + difference,
        behavior: "smooth",
      });
    }
    if ((buttonLeftEdge - padding) < navScrollLeft) {
      const difference = navScrollLeft - buttonLeftEdge + padding;
      this.nav.scrollTo({
        left: navScrollLeft - difference,
        behavior: "smooth",
      });
    }
  }
  setTabClickEventListener() {
    this.tabs.forEach((tab, index) => {
      tab.button.addEventListener("click", () => this.openTab(index));
    });
  }
  setScrollIconClickListener() {
    const handleScrollLeft = () => {
      this.nav.scrollTo({
        left: this.nav.scrollLeft - (this.nav.clientWidth / 2),
        behavior: "smooth",
      });
    }
    const handleScrollRight = () => {
      this.nav.scrollTo({
        left: this.nav.scrollLeft + (this.nav.clientWidth / 2),
        behavior: "smooth",
      });
    }

    this.scrollLeft.addEventListener('click', () => handleScrollLeft())
    this.scrollRight.addEventListener('click', () => handleScrollRight())
  }
  setNavScrollEventListener() {
    const handleScroll = () => {
      this.checkNavScrollPosition();
    }
    this.nav.addEventListener('scroll', () => handleScroll())
  }
  checkNavScrollPosition() {
    if (this.nav.clientWidth == this.nav.scrollWidth) {
      this.scrollLeft.classList.add('hide');
      this.scrollRight.classList.add('hide');
      return;
    }
    if (this.nav.scrollLeft < 1) {
      this.scrollLeft.classList.add('hide')
      this.scrollRight.classList.remove('hide')
    } else if (this.nav.scrollLeft + this.nav.clientWidth > (this.nav.scrollWidth - 1)) {
      this.scrollRight.classList.add('hide')
      this.scrollLeft.classList.remove('hide')
    } else {
      this.scrollRight.classList.remove('hide')
      this.scrollLeft.classList.remove('hide')
    }
  }
  addResizeEventListener() {
    const handleResize = () => {
      this.scrollTabIntoView(this.tabs.indexOf(this.activeTab));
    }
    window.addEventListener('resize', () => handleResize());
  }

  runSQSSiteBundle() {
    let siteBundle = document.querySelector(
      'body > [src*="https://static1.squarespace.com/static/vta"]'
    );
    let script = document.createElement("script");
    script.src = siteBundle.src;
    script.async = siteBundle.async;
    document.body.appendChild(script);
  }
}

(function () {
  async function getItemsFromCollection(path) {
    try {
      const url = new URL(path, window.location.origin); // Create a URL object from the collection URL
      const params = new URLSearchParams(url.search); // Use URLSearchParams for query parameters
      let isFeatured;
      if (params.has("featured")) {
        isFeatured = true; // Check and log the parameters (if 'size' exists and 'featured' is present)
        params.delete("featured");
      }

      const date = new Date().getTime(); // Adding a cache busting parameter
      params.set("format", "json");
      params.set("date", date);
      url.search = params.toString(); // Update the search part of the URL

      // Make the fetch request using the updated URL
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.status}`);
      }
      const data = await response.json();
      console.log(data);
      let items = data.items;
      if (!items) {
        throw new Error(`No items in the collection`);
      }
      if (isFeatured) {
        items = items.filter(item => item.starred === true);
      }
      console.log(items);
      return items; // Return the data so it can be used after await
    } catch (error) {
      console.error("Error fetching data:", error);
      throw error;
    }
  }
  async function getHTMLFromURL(url, selector = "#sections") {
    try {
      // Fetch the content from the URL
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const html = await response.text();

      // Parse the HTML and extract content based on the selector
      // Create a new DOM parser
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const selectedContent = doc.querySelector(selector);

      // Return the outer HTML of the selected element or an empty string if not found
      return selectedContent ? selectedContent.outerHTML : "";
    } catch (error) {
      console.error("Error fetching URL:", error);
      return "";
    }
  }
  function toUniqueDataAttribute(str) {
    // Normalize the string to lowercase
    let normalized = str.toLowerCase();

    // Replace spaces and invalid characters with underscores
    let baseString = normalized.replace(/[^a-z0-9\-_]/g, "-");

    // Ensure the string does not start with a digit, two hyphens, or a hyphen followed by a digit
    if (/^[0-9]|^--|^-[\d]/.test(baseString)) {
      baseString = "-" + baseString;
    }

    // Create a base attribute name
    let attributeName = baseString;

    // Check if this attribute already exists and append a number if it does
    let counter = 1;
    while (
      document.querySelector(`[${attributeName}]`) ||
      document.querySelector(`[${attributeName}-${counter}]`)
    ) {
      attributeName = baseString + "-" + counter;
      counter++;
    }

    return attributeName;
  }

  async function TabsBuilderFromSource(el) {
    const items = await getItemsFromCollection(el.dataset.source);
    if (items[0].recordTypeLabel == "portfolio-item") {
      const fetchPromises = items.map(item => getHTMLFromURL(item.fullUrl)); // Create an array of promises for fetching HTML content
      const contents = await Promise.all(fetchPromises); // Use Promise.all to fetch all HTML content concurrently
      items.forEach((item, index) => (item.body = contents[index])); // Assign the fetched content back to the items
    }
    el.innerHTML = `<header>
    <span class="border-bottom"></span>
    <span class="scroll-left"></span>
    <nav>
      <span class="indicator"></span>
      <span class="indicator-track"></span>
      ${items
        .map(
          item =>
            `<button data-id="${toUniqueDataAttribute(item.title)}">${
              item.title
            }</button>`
        )
        .join("")}
    </nav>
    <span class="scroll-right"></span>
  </header>
  <section class="tabs-wrapper">
    ${items
      .map(
        item => `<article data-id="${toUniqueDataAttribute(item.title)}">
      <div class="tab-content-wrapper">${item.body}</div>
    </article>`
      )
      .join("")}
  </section>`;

    el.wmTabs = new WMTabs(el);
  }

  const pluginEls = document.querySelectorAll('[data-wm-plugin="tabs"]');
  pluginEls.forEach(el => {
    if (el.dataset.source) {
      TabsBuilderFromSource(el);
    } else {
      TabsBuilderFromStackedSections(el);
    }
  });
  console.log(pluginEls);
})();
