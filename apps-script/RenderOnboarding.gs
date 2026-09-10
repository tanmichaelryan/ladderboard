// Shown in place of the console (RenderConsole.gs) for a player who hasn't
// chosen a nickname yet - view.me.needsName, set in Views.gs from
// Names.gs's needsName_. See Engine.gs's findOrEnrollPlayer_ for why new
// players start unnamed: nobody's real name/email can ever be the default,
// or a choosable one.

function renderOnboarding_(view) {
  return html_`
    <div class="card console-card">
      <div class="card-header">
        <div>
          <div class="mono header-eyebrow">YOUR CONTROLS</div>
          <div class="display card-title">Pick a name</div>
        </div>
      </div>
      <p class="onboarding-copy">
        Choose a display name before you play. This is what your teammates see on
        the board — please don't use your real name or email address.
      </p>
      <div class="inline-form">
        <input type="text" id="onboarding-name-input" maxlength="${NAME_MAX_}" placeholder="Nickname" aria-label="Display name">
        <button class="btn btn--primary" onclick="callServer_('serverSetName',[document.getElementById('onboarding-name-input').value],this)">Save</button>
      </div>
    </div>
  `;
}
