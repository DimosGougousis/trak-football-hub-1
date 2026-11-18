package com.academy.tiers;

import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

/** Task 2.6: ADR-002 enforced in the build. One class may write Player Card attributes. */
class ArchitectureTest {

    private static final String WRITER = "com.academy.tiers.progression.PlayerAttributeWriter";
    private static final String SIGNER = "com.academy.tiers.progression.TestResultService";

    @Test
    void onlyTestResultServiceUsesTheAttributeWriter() {
        var classes = new ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.academy.tiers");
        noClasses().that().doNotHaveFullyQualifiedName(SIGNER).and().doNotHaveFullyQualifiedName(WRITER)
            .should().dependOnClassesThat().haveFullyQualifiedName(WRITER)
            .because("only coach-signed tests may change attributes (ADR-002)")
            .check(classes);
    }

    @Test
    void onlyBillingCodeReadsPrices() {
        var classes = new ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.academy.tiers");
        noClasses().that().resideOutsideOfPackage("com.academy.tiers.billing..")
            .and().resideOutsideOfPackage("com.academy.tiers.entitlements..")
            .should().callMethod(com.academy.tiers.entitlements.Entitlements.class, "price", String.class)
            .because("prices exist only in the parent account (ADR-003)")
            .check(classes);
    }

    @Test
    void noOtherSourceFileWritesThePlayerAttributeTable() throws IOException {
        Pattern write = Pattern.compile("(?i)(insert\\s+into|update|delete\\s+from)\\s+player_attribute\\b");
        List<String> offenders;
        try (Stream<Path> files = Files.walk(Path.of("src/main/java"))) {
            offenders = files.filter(p -> p.toString().endsWith(".java"))
                .filter(p -> !p.toString().replace('\\', '/').endsWith("progression/PlayerAttributeWriter.java"))
                .filter(p -> {
                    try { return write.matcher(Files.readString(p)).find(); } catch (IOException e) { throw new RuntimeException(e); }
                })
                .map(Path::toString).toList();
        }
        assertThat(offenders).as("files writing player_attribute outside PlayerAttributeWriter").isEmpty();
    }
}
