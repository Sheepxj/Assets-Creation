package com.sheepxj.assets.system;

import com.sheepxj.assets.common.ApiExceptionHandler;
import com.sheepxj.assets.security.CsrfController;
import com.sheepxj.assets.security.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest({HealthController.class, CsrfController.class})
@Import({SecurityConfig.class, ApiExceptionHandler.class})
class InfrastructureContractTest {
    @Autowired private MockMvc mvc;
    @MockitoBean private SystemMapper mapper;
    @MockitoBean private ApplicationAvailability availability;
    @BeforeEach void acceptingTraffic() { when(availability.getReadinessState()).thenReturn(ReadinessState.ACCEPTING_TRAFFIC); }

    @Test
    void databaseReadinessCannotHideUnfinishedApplicationStartup() throws Exception {
        when(availability.getReadinessState()).thenReturn(ReadinessState.REFUSING_TRAFFIC);
        mvc.perform(get("/api/health")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("SERVICE_NOT_READY"));
        verifyNoInteractions(mapper);
    }

    @Test
    void healthChecksTheDatabaseThroughMyBatis() throws Exception {
        when(mapper.ping()).thenReturn(1);
        mvc.perform(get("/api/health")).andExpect(status().isOk())
                .andExpect(jsonPath("$.database").value("UP"));
    }

    @Test
    void databaseFailureDoesNotReportHealthy() throws Exception {
        when(mapper.ping()).thenThrow(new DataAccessResourceFailureException("offline"));
        mvc.perform(get("/api/health")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("DATABASE_UNAVAILABLE"));
    }

    @Test
    void protectedApiUsesJsonUnauthorizedInsteadOfLoginRedirect() throws Exception {
        mvc.perform(get("/api/tasks")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void csrfEndpointProvidesTokenAndHeaderName() throws Exception {
        mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.headerName").value("X-CSRF-TOKEN"));
    }

    @Test
    void writesWithoutCsrfAreRejectedWithJson() throws Exception {
        mvc.perform(post("/api/_smoke/echo")).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void smokeEndpointsAreAbsentInTheDefaultProfile() throws Exception {
        mvc.perform(get("/api/_smoke/cookies")).andExpect(status().isNotFound());
    }
}
