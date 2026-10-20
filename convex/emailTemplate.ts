type AvailabilityEmail = {
  title: string;
  branchName: string;
  checkedAt: number;
  catalogUrl: string;
  listsUrl: string;
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function buildAvailabilityEmail(message: AvailabilityEmail): { text: string; html: string } {
  const checkedAt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }).format(message.checkedAt);
  const title = escapeHtml(message.title);
  const branchName = escapeHtml(message.branchName);
  const catalogUrl = escapeHtml(message.catalogUrl);
  const listsUrl = escapeHtml(message.listsUrl);
  const text = `Your book is available.\n\n${message.title}\nAt ${message.branchName}\n\nView library catalog:\n${message.catalogUrl}\n\nChecked ${checkedAt} Central.\nAvailability can change. Check the catalog before you go.\n\nYou’re receiving this because you asked Shelf to watch this book at this branch.\nManage alerts or turn off email notifications:\n${message.listsUrl}\n\nShelf`;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Your book is available · Shelf</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f6ef;color:#183c34;-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${title} is available at ${branchName}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8f6ef;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;text-align:left;">
          <tr>
            <td style="padding:0 8px 24px;font:600 32px/1 Georgia,'Times New Roman',serif;color:#173e37;">Shelf<span style="color:#b85a37;">.</span></td>
          </tr>
          <tr>
            <td style="border-top:4px solid #b7bd9d;border-right:1px solid #dedfd4;border-bottom:1px solid #dedfd4;border-left:1px solid #dedfd4;background-color:#fffef9;padding:32px 24px;">
              <h1 style="margin:0 0 28px;font:400 34px/1.15 Georgia,'Times New Roman',serif;letter-spacing:-0.7px;color:#173e37;">Your book is available.</h1>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eeeee3;">
                <tr>
                  <td style="padding:24px;border-left:3px solid #7d8b68;overflow-wrap:anywhere;word-break:break-word;">
                    <h2 style="margin:0 0 20px;font:400 25px/1.3 Georgia,'Times New Roman',serif;color:#183c34;">${title}</h2>
                    <p style="margin:0 0 5px;font:400 11px/1.5 Arial,Helvetica,sans-serif;letter-spacing:1.2px;color:#596553;">LIBRARY BRANCH</p>
                    <p style="margin:0;font:600 15px/1.5 Arial,Helvetica,sans-serif;color:#183c34;">${branchName}</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                <tr>
                  <td bgcolor="#173e37" style="background-color:#173e37;mso-padding-alt:15px 22px;">
                    <a href="${catalogUrl}" style="display:inline-block;padding:15px 22px;border:1px solid #173e37;font:600 14px/1.5 Arial,Helvetica,sans-serif;text-decoration:none;color:#fffef9;">View library catalog &nbsp;&rarr;</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font:400 12px/1.8 Arial,Helvetica,sans-serif;color:#596553;">Checked ${escapeHtml(checkedAt)} Central.<br>Availability can change. Check the catalog before you go.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 8px 0;">
              <p style="margin:0 0 12px;font:400 12px/1.8 Arial,Helvetica,sans-serif;color:#596553;">You’re receiving this because you asked Shelf to watch this book at this branch.</p>
              <p style="margin:0;font:400 12px/1.8 Arial,Helvetica,sans-serif;"><a href="${listsUrl}" style="color:#4e6352;text-decoration:underline;">Manage alerts or turn off email notifications</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { text, html };
}

