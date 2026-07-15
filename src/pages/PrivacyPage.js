import React from 'react';
import { Link } from 'react-router-dom';
import './PrivacyPage.css';

const privacyStyles = `
  [data-custom-class='body'], [data-custom-class='body'] * {
    background: transparent !important;
  }
  [data-custom-class='title'], [data-custom-class='title'] * {
    font-family: Arial !important;
    font-size: 26px !important;
    color: #000000 !important;
  }
  [data-custom-class='subtitle'], [data-custom-class='subtitle'] * {
    font-family: Arial !important;
    color: #595959 !important;
    font-size: 14px !important;
  }
  [data-custom-class='heading_1'], [data-custom-class='heading_1'] * {
    font-family: Arial !important;
    font-size: 19px !important;
    color: #000000 !important;
  }
  [data-custom-class='heading_2'], [data-custom-class='heading_2'] * {
    font-family: Arial !important;
    font-size: 17px !important;
    color: #000000 !important;
  }
  [data-custom-class='body_text'], [data-custom-class='body_text'] * {
    color: #595959 !important;
    font-size: 14px !important;
    font-family: Arial !important;
  }
  [data-custom-class='link'], [data-custom-class='link'] * {
    color: #3030F1 !important;
    font-size: 14px !important;
    font-family: Arial !important;
    word-break: break-word !important;
  }
  ul {
    list-style-type: square;
  }
  ul > li > ul {
    list-style-type: circle;
  }
  ul > li > ul > li > ul {
    list-style-type: square;
  }
  ol li {
    font-family: Arial;
  }
`;

const privacyHTML = `
  <div data-custom-class="body">
    <div>
      <strong>
        <span style="font-size: 26px;">
          <span data-custom-class="title">
            <h1>PRIVACY POLICY</h1>
          </span>
        </span>
      </strong>
    </div>
    <div>
      <span style="color: rgb(127, 127, 127);">
        <strong>
          <span style="font-size: 15px;">
            <span data-custom-class="subtitle">Last updated June 23, 2026</span>
          </span>
        </strong>
      </span>
    </div>

    <br /><br />

    <div style="line-height: 1.5;">
      <span style="color: rgb(89, 89, 89); font-size: 15px;">
        <span data-custom-class="body_text">
          This Privacy Notice for <strong>Loop</strong> ("we," "us," or "our") describes how and why
          we might access, collect, store, use, and/or share ("process") your personal information
          when you use our services ("Services"), including when you:
        </span>
      </span>
    </div>

    <ul>
      <li data-custom-class="body_text" style="line-height: 1.5;">
        <span style="font-size: 15px; color: rgb(89, 89, 89);">
          <span data-custom-class="body_text">
            Visit our website at
            <a target="_blank" data-custom-class="link" href="https://hangoutwithyourfriends.fun">
              https://hangoutwithyourfriends.fun
            </a>
            or any website of ours that links to this Privacy Notice
          </span>
        </span>
      </li>
      <li data-custom-class="body_text" style="line-height: 1.5;">
        <span style="font-size: 15px; color: rgb(89, 89, 89);">
          <span data-custom-class="body_text">
            Engage with us in other related ways, including any marketing or events
          </span>
        </span>
      </li>
    </ul>

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong>Questions or concerns?</strong> Reading this Privacy Notice will help you
          understand your privacy rights and choices. We are responsible for making decisions about
          how your personal information is processed. If you do not agree with our policies and
          practices, please do not use our Services.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <strong>
        <span style="font-size: 15px;">
          <span data-custom-class="heading_1"><h2>SUMMARY OF KEY POINTS</h2></span>
        </span>
      </strong>
    </div>

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <span data-custom-class="body_text">
          <strong><em>This summary provides key points from our Privacy Notice, but you can find out
          more details about any of these topics by clicking the link following each key point or
          by using our </em></strong>
        </span>
      </span>
      <a data-custom-class="link" href="#toc">
        <span style="color: rgb(0, 58, 250); font-size: 15px;">
          <span data-custom-class="body_text"><strong><em>table of contents</em></strong></span>
        </span>
      </a>
      <span style="font-size: 15px;">
        <span data-custom-class="body_text"><strong><em> below to find the section you are looking for.</em></strong></span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong>What personal information do we process?</strong> When you visit, use, or navigate
          our Services, we may process personal information depending on how you interact with us
          and the Services, the choices you make, and the products and features you use. Learn more
          about <a data-custom-class="link" href="#personalinfo" style="color: rgb(0, 58, 250);">personal information you disclose to us</a>.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong>Do we process any sensitive personal information?</strong> Some of the information
          may be considered "special" or "sensitive" in certain jurisdictions. We do not process
          sensitive personal information.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong>Do we collect any information from third parties?</strong> We do not collect any
          information from third parties.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong>How do we process your information?</strong> We process your information to
          provide, improve, and administer our Services, communicate with you, for security and
          fraud prevention, and to comply with law. We may also process your information for other
          purposes with your consent. We process your information only when we have a valid legal
          reason to do so. Learn more about
          <a data-custom-class="link" href="#infouse" style="color: rgb(0, 58, 250);">how we process your information</a>.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong>In what situations and with which parties do we share personal information?</strong>
          We may share information in specific situations and with specific third parties. Learn more
          about <a data-custom-class="link" href="#whoshare" style="color: rgb(0, 58, 250);">when and with whom we share your personal information</a>.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong>What are your rights?</strong> Depending on where you are located geographically,
          the applicable privacy law may mean you have certain rights regarding your personal
          information. Learn more about
          <a data-custom-class="link" href="#privacyrights" style="color: rgb(0, 58, 250);">your privacy rights</a>.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          Want to learn more about what we do with any information we collect?
          <a data-custom-class="link" href="#toc" style="color: rgb(0, 58, 250);">Review the Privacy Notice in full</a>.
        </span>
      </span>
    </div>

    <br /><br />

    <!-- TABLE OF CONTENTS -->
    <div id="toc" style="line-height: 1.5;">
      <strong><span data-custom-class="heading_1"><h2>TABLE OF CONTENTS</h2></span></strong>
    </div>
    <div style="line-height: 1.5;"><a data-custom-class="link" href="#infocollect" style="color: rgb(0, 58, 250); font-size: 15px;">1. WHAT INFORMATION DO WE COLLECT?</a></div>
    <div style="line-height: 1.5;"><a data-custom-class="link" href="#infouse" style="color: rgb(0, 58, 250); font-size: 15px;">2. HOW DO WE PROCESS YOUR INFORMATION?</a></div>
    <div style="line-height: 1.5;"><a data-custom-class="link" href="#whoshare" style="color: rgb(0, 58, 250); font-size: 15px;">3. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</a></div>
    <div style="line-height: 1.5;"><a data-custom-class="link" href="#cookies" style="color: rgb(0, 58, 250); font-size: 15px;">4. DO WE USE COOKIES AND OTHER TRACKING TECHNOLOGIES?</a></div>
    <div style="line-height: 1.5;"><a data-custom-class="link" href="#ai" style="color: rgb(0, 58, 250); font-size: 15px;">5. DO WE OFFER ARTIFICIAL INTELLIGENCE-BASED PRODUCTS?</a></div>
    <div style="line-height: 1.5;"><a data-custom-class="link" href="#sociallogins" style="color: rgb(0, 58, 250); font-size: 15px;">6. HOW DO WE HANDLE YOUR SOCIAL LOGINS?</a></div>
    <div style="line-height: 1.5;"><a data-custom-class="link" href="#inforetain" style="color: rgb(0, 58, 250); font-size: 15px;">7. HOW LONG DO WE KEEP YOUR INFORMATION?</a></div>
    <div style="line-height: 1.5;"><a data-custom-class="link" href="#infominors" style="color: rgb(0, 58, 250); font-size: 15px;">8. DO WE COLLECT INFORMATION FROM MINORS?</a></div>
    <div style="line-height: 1.5;"><a data-custom-class="link" href="#privacyrights" style="color: rgb(0, 58, 250); font-size: 15px;">9. WHAT ARE YOUR PRIVACY RIGHTS?</a></div>
    <div style="line-height: 1.5;"><a data-custom-class="link" href="#DNT" style="color: rgb(0, 58, 250); font-size: 15px;">10. CONTROLS FOR DO-NOT-TRACK FEATURES</a></div>
    <div style="line-height: 1.5;"><a data-custom-class="link" href="#uslaws" style="color: rgb(0, 58, 250); font-size: 15px;">11. DO UNITED STATES RESIDENTS HAVE SPECIFIC PRIVACY RIGHTS?</a></div>
    <div style="line-height: 1.5;"><a data-custom-class="link" href="#policyupdates" style="color: rgb(0, 58, 250); font-size: 15px;">12. DO WE MAKE UPDATES TO THIS NOTICE?</a></div>
    <div style="line-height: 1.5;"><a data-custom-class="link" href="#contact" style="color: rgb(0, 58, 250); font-size: 15px;">13. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</a></div>
    <div style="line-height: 1.5;"><a data-custom-class="link" href="#request" style="color: rgb(0, 58, 250); font-size: 15px;">14. HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU?</a></div>

    <br /><br />

    <!-- SECTION 1 -->
    <div id="infocollect" style="line-height: 1.5;">
      <strong><span data-custom-class="heading_1"><h2>1. WHAT INFORMATION DO WE COLLECT?</h2></span></strong>
      <span data-custom-class="heading_2"><strong><h3>Personal information you disclose to us</h3></strong></span>
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong><em>In Short:</em></strong><em> We collect personal information that you provide to us.</em>
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          We collect personal information that you voluntarily provide to us when you register on
          the Services, express an interest in obtaining information about us or our products and
          Services, when you participate in activities on the Services, or otherwise when you
          contact us.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong>Personal Information Provided by You.</strong> The personal information we collect
          may include the following:
        </span>
      </span>
    </div>

    <ul>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: rgb(89, 89, 89);"><span data-custom-class="body_text">names</span></span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: rgb(89, 89, 89);"><span data-custom-class="body_text">email addresses</span></span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: rgb(89, 89, 89);"><span data-custom-class="body_text">usernames</span></span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: rgb(89, 89, 89);"><span data-custom-class="body_text">passwords</span></span></li>
    </ul>

    <div id="sensitiveinfo" style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <span data-custom-class="body_text">
          <strong>Sensitive Information.</strong> We do not process sensitive information.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong>Social Media Login Data.</strong> We may provide you with the option to register
          with us using your existing social media account details, like your Facebook, X, or other
          social media account. If you choose to register in this way, we will collect certain
          profile information about you from the social media provider, as described in the section
          called <a data-custom-class="link" href="#sociallogins" style="color: rgb(0, 58, 250);">HOW DO WE HANDLE YOUR SOCIAL LOGINS?</a> below.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          All personal information that you provide to us must be true, complete, and accurate,
          and you must notify us of any changes to such personal information.
        </span>
      </span>
    </div>

    <span data-custom-class="heading_2">
      <strong><h3>Information automatically collected</h3></strong>
    </span>

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong><em>In Short:</em></strong>
          <em> Some information — such as your Internet Protocol (IP) address and/or browser and
          device characteristics — is collected automatically when you visit our Services.</em>
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          We automatically collect certain information when you visit, use, or navigate the
          Services. This information does not reveal your specific identity but may include device
          and usage information, such as your IP address, browser and device characteristics,
          operating system, language preferences, referring URLs, device name, country, location,
          information about how and when you use our Services, and other technical information.
          This information is primarily needed to maintain the security and operation of our
          Services, and for our internal analytics and reporting purposes.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          Like many businesses, we also collect information through cookies and similar
          technologies.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">The information we collect includes:</span>
      </span>
    </div>

    <ul>
      <li data-custom-class="body_text" style="line-height: 1.5;">
        <span style="font-size: 15px; color: rgb(89, 89, 89);">
          <span data-custom-class="body_text">
            <em>Log and Usage Data.</em> Log and usage data is service-related, diagnostic, usage,
            and performance information our servers automatically collect when you access or use
            our Services and which we record in log files. Depending on how you interact with us,
            this log data may include your IP address, device information, browser type, and
            settings and information about your activity in the Services (such as the date/time
            stamps associated with your usage, pages and files viewed, searches, and other actions
            you take such as which features you use), device event information (such as system
            activity, error reports (sometimes called "crash dumps"), and hardware settings).
          </span>
        </span>
      </li>
    </ul>

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <strong><span data-custom-class="heading_2"><h3>Google API</h3></span></strong>
        <span data-custom-class="body_text">Our use of information received from Google APIs will adhere to the </span>
        <a data-custom-class="link" href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer" target="_blank" style="color: rgb(0, 58, 250);">
          <span data-custom-class="body_text">Google API Services User Data Policy</span>
        </a>
        <span data-custom-class="body_text">, including the </span>
        <a data-custom-class="link" href="https://developers.google.com/terms/api-services-user-data-policy#limited-use" rel="noopener noreferrer" target="_blank" style="color: rgb(0, 58, 250);">
          <span data-custom-class="body_text">Limited Use requirements</span>
        </a>
        <span data-custom-class="body_text">.</span>
      </span>
    </div>

    <br /><br />

    <!-- SECTION 2 -->
    <div id="infouse" style="line-height: 1.5;">
      <strong><span data-custom-class="heading_1"><h2>2. HOW DO WE PROCESS YOUR INFORMATION?</h2></span></strong>
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong><em>In Short: </em></strong>
          <em>We process your information to provide, improve, and administer our Services,
          communicate with you, for security and fraud prevention, and to comply with law. We may
          also process your information for other purposes with your consent.</em>
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong>We process your personal information for a variety of reasons, depending on how
          you interact with our Services, including:</strong>
        </span>
      </span>
    </div>

    <ul>
      <li data-custom-class="body_text" style="line-height: 1.5;">
        <span style="font-size: 15px; color: rgb(89, 89, 89);">
          <span data-custom-class="body_text">
            <strong>To facilitate account creation and authentication and otherwise manage user
            accounts.</strong> We may process your information so you can create and log in to
            your account, as well as keep your account in working order.
          </span>
        </span>
      </li>
      <li data-custom-class="body_text" style="line-height: 1.5;">
        <span style="font-size: 15px; color: rgb(89, 89, 89);">
          <span data-custom-class="body_text">
            <strong>To deliver and facilitate delivery of services to the user.</strong> We may
            process your information to provide you with the requested service.
          </span>
        </span>
      </li>
      <li data-custom-class="body_text" style="line-height: 1.5;">
        <span style="font-size: 15px; color: rgb(89, 89, 89);">
          <span data-custom-class="body_text">
            <strong>To request feedback.</strong> We may process your information when necessary
            to request feedback and to contact you about your use of our Services.
          </span>
        </span>
      </li>
      <li data-custom-class="body_text" style="line-height: 1.5;">
        <span style="font-size: 15px; color: rgb(89, 89, 89);">
          <span data-custom-class="body_text">
            <strong>To identify usage trends.</strong> We may process information about how you
            use our Services to better understand how they are being used so we can improve them.
          </span>
        </span>
      </li>
      <li data-custom-class="body_text" style="line-height: 1.5;">
        <span style="font-size: 15px; color: rgb(89, 89, 89);">
          <span data-custom-class="body_text">
            <strong>To comply with our legal obligations.</strong> We may process your information
            to comply with our legal obligations, respond to legal requests, and exercise,
            establish, or defend our legal rights.
          </span>
        </span>
      </li>
    </ul>

    <br />

    <!-- SECTION 3 -->
    <div id="whoshare" style="line-height: 1.5;">
      <strong><span data-custom-class="heading_1"><h2>3. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</h2></span></strong>
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong><em>In Short:</em></strong>
          <em> We may share information in specific situations described in this section and/or
          with the following third parties.</em>
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <span data-custom-class="body_text">We may need to share your personal information in the following situations:</span>
      </span>
    </div>

    <ul>
      <li data-custom-class="body_text" style="line-height: 1.5;">
        <span style="font-size: 15px;">
          <span data-custom-class="body_text">
            <strong>Business Transfers.</strong> We may share or transfer your information in
            connection with, or during negotiations of, any merger, sale of company assets,
            financing, or acquisition of all or a portion of our business to another company.
          </span>
        </span>
      </li>
    </ul>

    <br />

    <!-- SECTION 4 -->
    <div id="cookies" style="line-height: 1.5;">
      <strong><span data-custom-class="heading_1"><h2>4. DO WE USE COOKIES AND OTHER TRACKING TECHNOLOGIES?</h2></span></strong>
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong><em>In Short:</em></strong>
          <em> We may use cookies and other tracking technologies to collect and store your information.</em>
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          We may use cookies and similar tracking technologies (like web beacons and pixels) to
          gather information when you interact with our Services. Some online tracking technologies
          help us maintain the security of our Services and your account, prevent crashes, fix
          bugs, save your preferences, and assist with basic site functions.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          We also permit third parties and service providers to use online tracking technologies
          on our Services for analytics and advertising, including to help manage and display
          advertisements, to tailor advertisements to your interests, or to send abandoned
          shopping cart reminders (depending on your communication preferences).
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <span data-custom-class="body_text">
          To the extent these online tracking technologies are deemed to be a "sale"/"sharing"
          (which includes targeted advertising, as defined under applicable US state laws) under
          applicable US state laws, you can opt out of these online tracking technologies by
          submitting a request as described below under section
          <a data-custom-class="link" href="#uslaws" style="color: rgb(0, 58, 250);">DO UNITED STATES RESIDENTS HAVE SPECIFIC PRIVACY RIGHTS?</a>
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          Specific information about how we use such technologies and how you can refuse certain
          cookies is set out in our Cookie Notice.
        </span>
      </span>
    </div>

    <br />

    <!-- SECTION 5 -->
    <div id="ai" style="line-height: 1.5;">
      <strong><span data-custom-class="heading_1"><h2>5. DO WE OFFER ARTIFICIAL INTELLIGENCE-BASED PRODUCTS?</h2></span></strong>
      <span style="font-size: 15px;">
        <strong><em><span data-custom-class="body_text">In Short:</span></em></strong>
        <em><span data-custom-class="body_text"> We offer products, features, or tools powered by artificial intelligence, machine learning, or similar technologies.</span></em>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <span data-custom-class="body_text">
          As part of our Services, we offer products, features, or tools powered by artificial
          intelligence, machine learning, or similar technologies (collectively, "AI Products").
          These tools are designed to enhance your experience and provide you with innovative
          solutions. The terms in this Privacy Notice govern your use of the AI Products within
          our Services.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <strong><span style="font-size: 15px;"><span data-custom-class="body_text">Use of AI Technologies</span></span></strong>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <span data-custom-class="body_text">
          We provide the AI Products through third-party service providers ("AI Service
          Providers"), including <strong>Anthropic</strong>. As outlined in this Privacy Notice,
          your input, output, and personal information will be shared with and processed by these
          AI Service Providers to enable your use of our AI Products for purposes outlined in
          <a data-custom-class="link" href="#whoshare" style="color: rgb(0, 58, 250);">WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</a>
          You must not use the AI Products in any way that violates the terms or policies of any
          AI Service Provider.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <strong><span style="font-size: 15px;"><span data-custom-class="body_text">Our AI Products</span></span></strong>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;"><span data-custom-class="body_text">Our AI Products are designed for the following functions:</span></span>
    </div>

    <ul>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">AI insights</span></span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">AI automation</span></span></li>
    </ul>

    <div style="line-height: 1.5;">
      <strong><span style="font-size: 15px;"><span data-custom-class="body_text">How We Process Your Data Using AI</span></span></strong>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <span data-custom-class="body_text">
          All personal information processed using our AI Products is handled in line with our
          Privacy Notice and our agreement with third parties. This ensures high security and
          safeguards your personal information throughout the process, giving you peace of mind
          about your data's safety.
        </span>
      </span>
    </div>

    <br />

    <!-- SECTION 6 -->
    <div id="sociallogins" style="line-height: 1.5;">
      <strong><span data-custom-class="heading_1"><h2>6. HOW DO WE HANDLE YOUR SOCIAL LOGINS?</h2></span></strong>
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong><em>In Short: </em></strong>
          <em>If you choose to register or log in to our Services using a social media account,
          we may have access to certain information about you.</em>
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          Our Services offer you the ability to register and log in using your third-party social
          media account details (like your Facebook or X logins). Where you choose to do this, we
          will receive certain profile information about you from your social media provider. The
          profile information we receive may vary depending on the social media provider concerned,
          but will often include your name, email address, friends list, and profile picture, as
          well as other information you choose to make public on such a social media platform.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          We will use the information we receive only for the purposes that are described in this
          Privacy Notice or that are otherwise made clear to you on the relevant Services. Please
          note that we do not control, and are not responsible for, other uses of your personal
          information by your third-party social media provider. We recommend that you review their
          privacy notice to understand how they collect, use, and share your personal information,
          and how you can set your privacy preferences on their sites and apps.
        </span>
      </span>
    </div>

    <br />

    <!-- SECTION 7 -->
    <div id="inforetain" style="line-height: 1.5;">
      <strong><span data-custom-class="heading_1"><h2>7. HOW LONG DO WE KEEP YOUR INFORMATION?</h2></span></strong>
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong><em>In Short: </em></strong>
          <em>We keep your information for as long as necessary to fulfill the purposes outlined
          in this Privacy Notice unless otherwise required by law.</em>
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          We will only keep your personal information for as long as it is necessary for the
          purposes set out in this Privacy Notice, unless a longer retention period is required or
          permitted by law (such as tax, accounting, or other legal requirements). No purpose in
          this notice will require us keeping your personal information for longer than the period
          of time in which users have an account with us.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          When we have no ongoing legitimate business need to process your personal information,
          we will either delete or anonymize such information, or, if this is not possible (for
          example, because your personal information has been stored in backup archives), then we
          will securely store your personal information and isolate it from any further processing
          until deletion is possible.
        </span>
      </span>
    </div>

    <br />

    <!-- SECTION 8 -->
    <div id="infominors" style="line-height: 1.5;">
      <strong><span data-custom-class="heading_1"><h2>8. DO WE COLLECT INFORMATION FROM MINORS?</h2></span></strong>
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong><em>In Short:</em></strong>
          <em> We do not knowingly collect data from or market to children under 18 years of age.</em>
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          We do not knowingly collect, solicit data from, or market to children under 18 years of
          age, nor do we knowingly sell such personal information. By using the Services, you
          represent that you are at least 18 or that you are the parent or guardian of such a
          minor and consent to such minor dependent's use of the Services. If we learn that
          personal information from users less than 18 years of age has been collected, we will
          deactivate the account and take reasonable measures to promptly delete such data from
          our records. If you become aware of any data we may have collected from children under
          age 18, please contact us.
        </span>
      </span>
    </div>

    <br />

    <!-- SECTION 9 -->
    <div id="privacyrights" style="line-height: 1.5;">
      <strong><span data-custom-class="heading_1"><h2>9. WHAT ARE YOUR PRIVACY RIGHTS?</h2></span></strong>
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong><em>In Short:</em></strong>
          <em> You may review, change, or terminate your account at any time, depending on your
          country, province, or state of residence.</em>
        </span>
      </span>
    </div>

    <br />

    <div id="withdrawconsent" style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong><u>Withdrawing your consent:</u></strong> If we are relying on your consent to
          process your personal information, you have the right to withdraw your consent at any
          time. You can withdraw your consent at any time by contacting us by using the contact
          details provided in the section
          <a data-custom-class="link" href="#contact" style="color: rgb(0, 58, 250);">HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</a> below.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <span data-custom-class="body_text">
          However, please note that this will not affect the lawfulness of the processing before
          its withdrawal nor, when applicable law allows, will it affect the processing of your
          personal information conducted in reliance on lawful processing grounds other than consent.
        </span>
      </span>
    </div>

    <span data-custom-class="heading_2"><strong><h3>Account Information</h3></strong></span>

    <div style="line-height: 1.5;">
      <span data-custom-class="body_text">
        <span style="font-size: 15px;">If you would at any time like to review or change the information in your account or terminate your account, you can:</span>
      </span>
    </div>

    <ul>
      <li data-custom-class="body_text" style="line-height: 1.5;">
        <span data-custom-class="body_text"><span style="font-size: 15px;">Log in to your account settings and update your user account.</span></span>
      </li>
    </ul>

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <span data-custom-class="body_text">
          Upon your request to terminate your account, we will deactivate or delete your account
          and information from our active databases. However, we may retain some information in
          our files to prevent fraud, troubleshoot problems, assist with any investigations,
          enforce our legal terms and/or comply with applicable legal requirements.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong><u>Cookies and similar technologies:</u></strong> Most Web browsers are set to
          accept cookies by default. If you prefer, you can usually choose to set your browser to
          remove cookies and to reject cookies. If you choose to remove cookies or reject cookies,
          this could affect certain features or services of our Services.
        </span>
      </span>
    </div>

    <br />

    <!-- SECTION 10 -->
    <div id="DNT" style="line-height: 1.5;">
      <strong><span data-custom-class="heading_1"><h2>10. CONTROLS FOR DO-NOT-TRACK FEATURES</h2></span></strong>
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          Most web browsers and some mobile operating systems and mobile applications include a
          Do-Not-Track ("DNT") feature or setting you can activate to signal your privacy
          preference not to have data about your online browsing activities monitored and
          collected. At this stage, no uniform technology standard for recognizing and implementing
          DNT signals has been finalized. As such, we do not currently respond to DNT browser
          signals or any other mechanism that automatically communicates your choice not to be
          tracked online. If a standard for online tracking is adopted that we must follow in the
          future, we will inform you about that practice in a revised version of this Privacy Notice.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <span data-custom-class="body_text">
          California law requires us to let you know how we respond to web browser DNT signals.
          Because there currently is not an industry or legal standard for recognizing or honoring
          DNT signals, we do not respond to them at this time.
        </span>
      </span>
    </div>

    <br />

    <!-- SECTION 11 -->
    <div id="uslaws" style="line-height: 1.5;">
      <strong><span data-custom-class="heading_1"><h2>11. DO UNITED STATES RESIDENTS HAVE SPECIFIC PRIVACY RIGHTS?</h2></span></strong>
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <strong><em>In Short: </em></strong>
          <em>If you are a resident of California, Colorado, Connecticut, Delaware, Florida,
          Indiana, Iowa, Kentucky, Maryland, Minnesota, Montana, Nebraska, New Hampshire, New
          Jersey, Oregon, Rhode Island, Tennessee, Texas, Utah, or Virginia, you may have the
          right to request access to and receive details about the personal information we
          maintain about you and how we have processed it, correct inaccuracies, get a copy of,
          or delete your personal information. You may also have the right to withdraw your
          consent to our processing of your personal information. These rights may be limited in
          some circumstances by applicable law. More information is provided below.</em>
        </span>
      </span>
    </div>

    <strong><span data-custom-class="heading_2"><h3>Categories of Personal Information We Collect</h3></span></strong>

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          The table below shows the categories of personal information we have collected in the
          past twelve (12) months.
        </span>
      </span>
    </div>

    <br />

    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th style="width: 34%; border: 1px solid black; padding: 8px; text-align: left;"><span style="font-size: 15px;" data-custom-class="body_text"><strong>Category</strong></span></th>
          <th style="width: 51%; border: 1px solid black; padding: 8px; text-align: left;"><span style="font-size: 15px;" data-custom-class="body_text"><strong>Examples</strong></span></th>
          <th style="width: 15%; border: 1px solid black; padding: 8px; text-align: left;"><span style="font-size: 15px;" data-custom-class="body_text"><strong>Collected</strong></span></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">A. Identifiers</span></td>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">Contact details, such as real name, alias, postal address, telephone or mobile contact number, unique personal identifier, online identifier, Internet Protocol address, email address, and account name</span></td>
          <td style="border: 1px solid black; padding: 8px; text-align: center;"><span style="font-size: 15px;" data-custom-class="body_text">YES</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">B. Personal information as defined in the California Customer Records statute</span></td>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">Name, contact information, education, employment, employment history, and financial information</span></td>
          <td style="border: 1px solid black; padding: 8px; text-align: center;"><span style="font-size: 15px;" data-custom-class="body_text">YES</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">C. Protected classification characteristics under state or federal law</span></td>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">Gender, age, date of birth, race and ethnicity, national origin, marital status, and other demographic data</span></td>
          <td style="border: 1px solid black; padding: 8px; text-align: center;"><span style="font-size: 15px;" data-custom-class="body_text">NO</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">D. Commercial information</span></td>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">Transaction information, purchase history, financial details, and payment information</span></td>
          <td style="border: 1px solid black; padding: 8px; text-align: center;"><span style="font-size: 15px;" data-custom-class="body_text">NO</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">E. Biometric information</span></td>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">Fingerprints and voiceprints</span></td>
          <td style="border: 1px solid black; padding: 8px; text-align: center;"><span style="font-size: 15px;" data-custom-class="body_text">NO</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">F. Internet or other similar network activity</span></td>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">Browsing history, search history, online behavior, interest data, and interactions with our and other websites, applications, systems, and advertisements</span></td>
          <td style="border: 1px solid black; padding: 8px; text-align: center;"><span style="font-size: 15px;" data-custom-class="body_text">NO</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">G. Geolocation data</span></td>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">Device location</span></td>
          <td style="border: 1px solid black; padding: 8px; text-align: center;"><span style="font-size: 15px;" data-custom-class="body_text">NO</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">H. Audio, electronic, sensory, or similar information</span></td>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">Images and audio, video or call recordings created in connection with our business activities</span></td>
          <td style="border: 1px solid black; padding: 8px; text-align: center;"><span style="font-size: 15px;" data-custom-class="body_text">NO</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">I. Professional or employment-related information</span></td>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">Business contact details in order to provide you our services at a business level or job title, work history, and professional qualifications if you apply for a job with us</span></td>
          <td style="border: 1px solid black; padding: 8px; text-align: center;"><span style="font-size: 15px;" data-custom-class="body_text">NO</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">J. Education Information</span></td>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">Student records and directory information</span></td>
          <td style="border: 1px solid black; padding: 8px; text-align: center;"><span style="font-size: 15px;" data-custom-class="body_text">NO</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">K. Inferences drawn from collected personal information</span></td>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">Inferences drawn from any of the collected personal information listed above to create a profile or summary about, for example, an individual's preferences and characteristics</span></td>
          <td style="border: 1px solid black; padding: 8px; text-align: center;"><span style="font-size: 15px;" data-custom-class="body_text">YES</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><span style="font-size: 15px;" data-custom-class="body_text">L. Sensitive personal information</span></td>
          <td style="border: 1px solid black; padding: 8px;"></td>
          <td style="border: 1px solid black; padding: 8px; text-align: center;"><span style="font-size: 15px;" data-custom-class="body_text">NO</span></td>
        </tr>
      </tbody>
    </table>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <span data-custom-class="body_text">
          We may also collect other personal information outside of these categories through
          instances where you interact with us in person, online, or by phone or mail in the
          context of: receiving help through our customer support channels; participation in
          customer surveys or contests; and facilitation in the delivery of our Services and to
          respond to your inquiries.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span data-custom-class="body_text">We will use and retain the collected personal information as needed to provide the Services or for:</span>
    </div>

    <ul>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text">Category A - As long as the user has an account with us</span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text">Category B - As long as the user has an account with us</span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text">Category K - As long as the user has an account with us</span></li>
    </ul>

    <strong><span style="font-size: 15px;"><span data-custom-class="heading_2"><h3>Sources of Personal Information</h3></span></span></strong>

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <span data-custom-class="body_text">
          Learn more about the sources of personal information we collect in
          <a data-custom-class="link" href="#infocollect" style="color: rgb(0, 58, 250);">WHAT INFORMATION DO WE COLLECT?</a>
        </span>
      </span>
    </div>

    <strong><span data-custom-class="heading_2"><h3>How We Use and Share Personal Information</h3></span></strong>

    <div style="line-height: 1.5;">
      <span data-custom-class="body_text" style="font-size: 15px;">
        Learn more about how we use your personal information in the section,
        <a data-custom-class="link" href="#infouse" style="color: rgb(0, 58, 250);">HOW DO WE PROCESS YOUR INFORMATION?</a>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text"><strong>Will your information be shared with anyone else?</strong></span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          We may disclose your personal information with our service providers pursuant to a
          written contract between us and each service provider. Learn more about how we disclose
          personal information to in the section,
          <a data-custom-class="link" href="#whoshare" style="color: rgb(0, 58, 250);">WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</a>
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          We may use your personal information for our own business purposes, such as for
          undertaking internal research for technological development and demonstration. This is
          not considered to be "selling" of your personal information.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          We have not disclosed, sold, or shared any personal information to third parties for a
          business or commercial purpose in the preceding twelve (12) months. We will not sell or
          share personal information in the future belonging to website visitors, users, and other
          consumers.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;"><strong><span data-custom-class="heading_2"><h3>Your Rights</h3></span></strong></span>
      <span style="font-size: 15px;"><span data-custom-class="body_text">You have rights under certain US state data protection laws. However, these rights are not absolute, and in certain cases, we may decline your request as permitted by law. These rights include:</span></span>
    </div>

    <ul>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><strong>Right to know</strong> whether or not we are processing your personal data</span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><strong>Right to access</strong> your personal data</span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><strong>Right to correct</strong> inaccuracies in your personal data</span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><strong>Right to request</strong> the deletion of your personal data</span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><strong>Right to obtain a copy</strong> of the personal data you previously shared with us</span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><strong>Right to non-discrimination</strong> for exercising your rights</span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><strong>Right to opt out</strong> of the processing of your personal data if it is used for targeted advertising, the sale of personal data, or profiling in furtherance of decisions that produce legal or similarly significant effects ("profiling")</span></li>
    </ul>

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;"><span data-custom-class="body_text">Depending upon the state where you live, you may also have the following rights:</span></span>
    </div>

    <ul>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;">Right to access the categories of personal data being processed (as permitted by applicable law, including the privacy law in Minnesota)</span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;">Right to obtain a list of the categories of third parties to which we have disclosed personal data (as permitted by applicable law, including the privacy law in California, Delaware, and Maryland)</span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;">Right to obtain a list of specific third parties to which we have disclosed personal data (as permitted by applicable law, including the privacy law in Minnesota and Oregon)</span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;">Right to obtain a list of third parties to which we have sold personal data (as permitted by applicable law, including the privacy law in Connecticut)</span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;">Right to review, understand, question, and depending on where you live, correct how personal data has been profiled (as permitted by applicable law, including the privacy law in Connecticut and Minnesota)</span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;">Right to limit use and disclosure of sensitive personal data (as permitted by applicable law, including the privacy law in California)</span></li>
      <li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;">Right to opt out of the collection of sensitive data and personal data collected through the operation of a voice or facial recognition feature (as permitted by applicable law, including the privacy law in Florida)</span></li>
    </ul>

    <strong><span style="font-size: 15px;"><span data-custom-class="heading_2"><h3>How to Exercise Your Rights</h3></span></span></strong>

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          To exercise these rights, you can contact us by referring to the contact details at the
          bottom of this document.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <span data-custom-class="body_text">
          Under certain US state data protection laws, you can designate an authorized agent to
          make a request on your behalf. We may deny a request from an authorized agent that does
          not submit proof that they have been validly authorized to act on your behalf in
          accordance with applicable laws.
        </span>
      </span>
    </div>

    <strong><span style="font-size: 15px;"><span data-custom-class="heading_2"><h3>Request Verification</h3></span></span></strong>

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <span data-custom-class="body_text">
          Upon receiving your request, we will need to verify your identity to determine you are
          the same person about whom we have the information in our system. We will only use
          personal information provided in your request to verify your identity or authority to
          make the request. However, if we cannot verify your identity from the information
          already maintained by us, we may request that you provide additional information for the
          purposes of verifying your identity and for security or fraud-prevention purposes.
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <span data-custom-class="body_text">
          If you submit the request through an authorized agent, we may need to collect additional
          information to verify your identity before processing your request and the agent will
          need to provide a written and signed permission from you to submit such request on your
          behalf.
        </span>
      </span>
    </div>

    <strong><span style="font-size: 15px;"><span data-custom-class="heading_2"><h3>Appeals</h3></span></span></strong>

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <span data-custom-class="body_text">
          Under certain US state data protection laws, if we decline to take action regarding your
          request, you may appeal our decision by emailing us. We will inform you in writing of
          any action taken or not taken in response to the appeal, including a written explanation
          of the reasons for the decisions. If your appeal is denied, you may submit a complaint
          to your state attorney general.
        </span>
      </span>
    </div>

    <strong><span style="font-size: 15px;"><span data-custom-class="heading_2"><h3>California "Shine The Light" Law</h3></span></span></strong>

    <div style="line-height: 1.5;">
      <span style="font-size: 15px;">
        <span data-custom-class="body_text">
          California Civil Code Section 1798.83, also known as the "Shine The Light" law, permits
          our users who are California residents to request and obtain from us, once a year and
          free of charge, information about categories of personal information (if any) we
          disclosed to third parties for direct marketing purposes and the names and addresses of
          all third parties with which we shared personal information in the immediately preceding
          calendar year. If you are a California resident and would like to make such a request,
          please submit your request in writing to us by using the contact details provided in the
          section <a data-custom-class="link" href="#contact" style="color: rgb(0, 58, 250);">HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</a>
        </span>
      </span>
    </div>

    <br /><br />

    <!-- SECTION 12 -->
    <div id="policyupdates" style="line-height: 1.5;">
      <strong><span data-custom-class="heading_1"><h2>12. DO WE MAKE UPDATES TO THIS NOTICE?</h2></span></strong>
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          <em><strong>In Short: </strong>Yes, we will update this notice as necessary to stay compliant with relevant laws.</em>
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          We may update this Privacy Notice from time to time. The updated version will be
          indicated by an updated "Revised" date at the top of this Privacy Notice. If we make
          material changes to this Privacy Notice, we may notify you either by prominently posting
          a notice of such changes or by directly sending you a notification. We encourage you to
          review this Privacy Notice frequently to be informed of how we are protecting your
          information.
        </span>
      </span>
    </div>

    <br />

    <!-- SECTION 13 -->
    <div id="contact" style="line-height: 1.5;">
      <strong><span data-custom-class="heading_1"><h2>13. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</h2></span></strong>
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          If you have questions or comments about this notice, you may contact us by post at:
        </span>
      </span>
    </div>

    <br />

    <div style="line-height: 1.5;">
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          Loop<br />
          Medford, MA 02155<br />
          United States
        </span>
      </span>
    </div>

    <br />

    <!-- SECTION 14 -->
    <div id="request" style="line-height: 1.5;">
      <strong><span data-custom-class="heading_1"><h2>14. HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU?</h2></span></strong>
      <span style="font-size: 15px; color: rgb(89, 89, 89);">
        <span data-custom-class="body_text">
          Based on the applicable laws of your country or state of residence in the US, you may
          have the right to request access to the personal information we collect from you, details
          about how we have processed it, correct inaccuracies, or delete your personal
          information. You may also have the right to withdraw your consent to our processing of
          your personal information. These rights may be limited in some circumstances by
          applicable law. To request to review, update, or delete your personal information,
          please contact us using the details in the section above.
        </span>
      </span>
    </div>

    <br />

    <div>
      <span data-custom-class="body_text">
        This Privacy Policy was created using Termly's
        <a href="https://termly.io/products/privacy-policy-generator/" target="_blank" rel="noopener external" data-custom-class="link">Privacy Policy Generator</a>
      </span>
    </div>
  </div>
`;

const PrivacyPage = () => (
  <div className="privacy-page">
    <Link to="/dashboard" className="privacy-back">← Back</Link>
    <h1>Privacy Policy</h1>
    <style>{privacyStyles}</style>
    {/* privacy-doc: the generated legal text hard-codes dark-on-transparent
        colors, so dark mode gives it a light card to stay readable. */}
    <div className="privacy-doc" dangerouslySetInnerHTML={{ __html: privacyHTML }} />
  </div>
);

export default PrivacyPage;
