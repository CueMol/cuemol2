# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

installer:
	@$(MAKE) -C cuemol2/installer installer

package:
	@$(MAKE) -C cuemol2/installer make-archive

l10n-package:
	@$(MAKE) -C cuemol2/installer make-langpack

mozpackage:
	@$(MAKE) -C cuemol2/installer

package-compare:
	@$(MAKE) -C cuemol2/installer package-compare

stage-package:
	@$(MAKE) -C cuemol2/installer stage-package make-buildinfo-file

install::
	@$(MAKE) -C cuemol2/installer install

clean::
	@$(MAKE) -C cuemol2/installer clean

distclean::
	@$(MAKE) -C cuemol2/installer distclean

source-package::
	@$(MAKE) -C cuemol2/installer source-package

upload::
	@$(MAKE) -C cuemol2/installer upload

source-upload::
	@$(MAKE) -C cuemol2/installer source-upload

hg-bundle::
	@$(MAKE) -C cuemol2/installer hg-bundle

l10n-check::
	@$(MAKE) -C cuemol2/locales l10n-check

ifdef ENABLE_TESTS
# Implemented in testing/testsuite-targets.mk

mochitest-browser-chrome:
	$(RUN_MOCHITEST) --browser-chrome
	$(CHECK_TEST_ERROR)

mochitest:: mochitest-browser-chrome

.PHONY: mochitest-browser-chrome

mochitest-metro-chrome:
	$(RUN_MOCHITEST) --metro-immersive --browser-chrome
	$(CHECK_TEST_ERROR)


endif
